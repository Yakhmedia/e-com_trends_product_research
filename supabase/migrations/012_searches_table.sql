-- ============================================================
-- 012_searches_table.sql
-- Phase 1.2 — separate per-user search history from the shared cache.
--
-- `public.trends` has no user_id: it is a global cache keyed on
-- (keyword, date_range) so one user's metered SerpAPI lookup serves
-- everyone. That is correct and stays.
--
-- But app/history/page.tsx queried `trends` directly from the browser, so
-- in a multi-user world every user's research history was visible to every
-- other user — and its delete button removed rows from the shared cache,
-- evicting other users' data.
--
-- `public.searches` is the per-user record: who looked up what, when,
-- pointing at the cache row that answered. RLS'd to the owner.
-- Run AFTER 011_kb_fts_fix.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.searches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword    text        NOT NULL,
  date_range text        NOT NULL,
  -- Keep the history row even if the cache entry is later evicted.
  trend_id   uuid        REFERENCES public.trends(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS searches_user_created_idx
  ON public.searches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS searches_trend_idx
  ON public.searches (trend_id);

-- ── RLS: strictly the owner ─────────────────────────────────
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own searches"   ON public.searches;
DROP POLICY IF EXISTS "Users delete own searches" ON public.searches;

CREATE POLICY "Users read own searches" ON public.searches
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own searches" ON public.searches
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- No INSERT/UPDATE policy: rows are written only by the /api/trends route
-- handler via the service-role client, after its auth guard.

-- ── Verify ─────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename = 'searches';
