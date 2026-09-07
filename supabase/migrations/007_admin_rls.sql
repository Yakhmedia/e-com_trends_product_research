-- ============================================================
-- 007_admin_rls.sql
-- Move the admin gate from middleware into the database.
--
-- Every trends policy was USING (auth.role() = 'authenticated') —
-- including FOR DELETE. Any signed-in non-admin could read and delete
-- every row straight through the REST API without loading the app at
-- all. The admin check existed only in middleware.ts, which is not in
-- the path of a direct PostgREST call.
-- Run AFTER 006_fix_role_default.sql.
-- ============================================================

-- ── Admin predicate ──────────────────────────────────────────
-- SECURITY DEFINER so it can read public.profiles without being subject
-- to that table's own RLS (which would otherwise recurse). STABLE lets
-- the planner call it once per statement rather than once per row.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$func$;

-- ── trends: admin-only ───────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated read trends"   ON public.trends;
DROP POLICY IF EXISTS "Authenticated insert trends" ON public.trends;
DROP POLICY IF EXISTS "Authenticated delete trends" ON public.trends;
DROP POLICY IF EXISTS "Admins read trends"          ON public.trends;
DROP POLICY IF EXISTS "Admins insert trends"        ON public.trends;
DROP POLICY IF EXISTS "Admins delete trends"        ON public.trends;

CREATE POLICY "Admins read trends"   ON public.trends FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins insert trends" ON public.trends FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete trends" ON public.trends FOR DELETE USING (public.is_admin());

-- ── knowledge_base: admin-only ───────────────────────────────
-- NOTE: migration 004 created "Authenticated read knowledge" and 005
-- created "Authenticated read knowledge_base" — BOTH exist in
-- production. Policies are OR'd, so dropping only one would leave the
-- table readable by any authenticated user and defeat this migration.
DROP POLICY IF EXISTS "Authenticated read knowledge"    ON public.knowledge_base;
DROP POLICY IF EXISTS "Authenticated read knowledge_base" ON public.knowledge_base;
DROP POLICY IF EXISTS "Admins read knowledge_base"      ON public.knowledge_base;

CREATE POLICY "Admins read knowledge_base" ON public.knowledge_base
  FOR SELECT USING (public.is_admin());

-- ── Verify ───────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
