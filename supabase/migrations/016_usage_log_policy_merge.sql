-- ============================================================
-- 016_usage_log_policy_merge.sql
-- Perf advisor (multiple_permissive_policies): usage_log had two
-- permissive SELECT policies for `authenticated` — "Users read own usage"
-- and "Admins read all usage" — so both ran on every query. Merge into one.
-- Run AFTER 015_usage_log.sql.
-- ============================================================

DROP POLICY IF EXISTS "Users read own usage"            ON public.usage_log;
DROP POLICY IF EXISTS "Admins read all usage"           ON public.usage_log;
DROP POLICY IF EXISTS "Read own usage, admins read all" ON public.usage_log;

CREATE POLICY "Read own usage, admins read all" ON public.usage_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());
