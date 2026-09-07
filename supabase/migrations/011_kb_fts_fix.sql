-- ============================================================
-- 011_kb_fts_fix.sql
-- Phase 0.2 — make knowledge_base full-text search actually work.
--
-- Two bugs, migration 004 + app/api/agent/route.ts:
--   1. The GIN index was on to_tsvector('english', title || ' ' || content)
--      but the query filtered to_tsvector('english', content) — a different
--      expression, so the planner did a sequential scan every time.
--   2. `title` and the seeded `keywords[]` array never contributed to search.
--
-- Fix: a STORED generated tsvector over title + content + keywords, a GIN
-- index on it, and the route query repointed at the `tsv` column (code
-- change ships in the same change set: route.ts uses
-- .textSearch("tsv", terms, { config: "english" }) with no `type`, so
-- supabase-js emits to_tsquery — which honours `|` — not
-- websearch_to_tsquery, which ANDs).
--
-- (The KB is already seeded with the 12 rows from migration 004 — an
-- earlier "0 rows" reading was a stale pg_class estimate, not reality.)
-- Run AFTER 010_harden_functions.sql.
-- ============================================================

-- ── Idempotency anchor ──────────────────────────────────────
-- No natural key existed. `title` is unique across the seed and a
-- sensible upsert target for future admin edits.
ALTER TABLE public.knowledge_base
  DROP CONSTRAINT IF EXISTS knowledge_base_title_key;
ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_title_key UNIQUE (title);

-- ── IMMUTABLE search-document builder ───────────────────────
-- A generated column's expression must be provably immutable. The bare
-- to_tsvector('english', …) form is only STABLE (the text→regconfig cast
-- is stable), so wrap it: the two-arg to_tsvector(regconfig, text) with a
-- constant-folded regconfig literal is immutable.
CREATE OR REPLACE FUNCTION public.kb_search_document(
  p_title    text,
  p_content  text,
  p_keywords text[]
)
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $func$
  SELECT pg_catalog.to_tsvector(
    'pg_catalog.english'::pg_catalog.regconfig,
    COALESCE(p_title, '')   || ' ' ||
    COALESCE(p_content, '') || ' ' ||
    COALESCE(pg_catalog.array_to_string(p_keywords, ' '), '')
  )
$func$;

-- ── Generated search vector + index ─────────────────────────
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (public.kb_search_document(title, content, keywords)) STORED;

DROP INDEX IF EXISTS public.kb_fts_idx;
CREATE INDEX IF NOT EXISTS kb_tsv_idx ON public.knowledge_base USING gin (tsv);

-- ── Verify ─────────────────────────────────────────────────
-- EXPLAIN ANALYZE
--   SELECT title FROM public.knowledge_base
--   WHERE tsv @@ to_tsquery('english', 'seasonal | christmas | inventory');
-- → Bitmap Index Scan on kb_tsv_idx
