-- ============================================================
-- 015_usage_log.sql
-- Phase 4.3 — per-request usage + cost, and the anchor for the
-- keyless trial quota (Phase 4.1).
--
-- One row per completed agent call: who, which provider/model, whose
-- key paid, token counts, an estimated cost, the finish reason, latency.
-- Never the key.
--
-- Admins read the whole table (platform totals); a user reads only their
-- own rows. Writes are service-role only (the agent route on finish).
-- Run AFTER 014_provider_credentials.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.usage_log (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider           text        NOT NULL,
  model              text        NOT NULL,
  key_source         text        NOT NULL CHECK (key_source IN ('byok', 'server')),
  input_tokens       integer,
  output_tokens      integer,
  estimated_cost_usd numeric(12, 6),
  finish_reason      text,
  latency_ms         integer,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_log_user_created_idx
  ON public.usage_log (user_id, created_at DESC);
-- Supports the trial-quota count: rows this user spent on the shared key.
CREATE INDEX IF NOT EXISTS usage_log_server_trial_idx
  ON public.usage_log (user_id)
  WHERE key_source = 'server';

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own usage"  ON public.usage_log;
DROP POLICY IF EXISTS "Admins read all usage" ON public.usage_log;

CREATE POLICY "Users read own usage" ON public.usage_log
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins read all usage" ON public.usage_log
  FOR SELECT TO authenticated USING (private.is_admin());

-- NOTE: 016 merges these two into one policy (perf advisor:
-- multiple_permissive_policies). Kept split here to mirror applied history.

-- No client INSERT/UPDATE/DELETE: written by the agent route via service role.

-- ── Verify ─────────────────────────────────────────────────
-- SELECT provider, model, count(*), sum(estimated_cost_usd)
-- FROM public.usage_log GROUP BY 1, 2;
