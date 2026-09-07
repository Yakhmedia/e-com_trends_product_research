-- ============================================================
-- 013_viewer_capabilities.sql
-- Phase 1.1 / 1.3 — give the `viewer` role something to do.
--
-- Migrations 007/010 locked `trends` and `knowledge_base` to admins, so a
-- viewer could authenticate and was then bounced off every route and read
-- nothing. The multi-tenant model needs:
--   - trends:         any authenticated user may READ the shared cache;
--                     writes stay service-role only (the /api/trends route)
--   - knowledge_base: any authenticated user may READ (the agent's RAG
--                     grounding); writes are admin-only
--
-- Run AFTER 012_searches_table.sql.
-- ============================================================

-- ── trends: shared read for all authenticated users ────────
DROP POLICY IF EXISTS "Admins read trends"          ON public.trends;
DROP POLICY IF EXISTS "Admins insert trends"        ON public.trends;
DROP POLICY IF EXISTS "Admins delete trends"        ON public.trends;
DROP POLICY IF EXISTS "Authenticated read trends"   ON public.trends;
DROP POLICY IF EXISTS "Authenticated insert trends" ON public.trends;
DROP POLICY IF EXISTS "Authenticated delete trends" ON public.trends;

CREATE POLICY "Authenticated read trends" ON public.trends
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy: the cache is maintained exclusively by
-- the /api/trends route handler through the service-role client, which
-- bypasses RLS. A user clearing their history must not be able to evict
-- another user's cached data (that is what public.searches is for).

-- ── knowledge_base: authenticated read, admin write ────────
DROP POLICY IF EXISTS "Admins read knowledge_base"          ON public.knowledge_base;
DROP POLICY IF EXISTS "Authenticated read knowledge_base"   ON public.knowledge_base;
DROP POLICY IF EXISTS "Authenticated read knowledge"        ON public.knowledge_base;
DROP POLICY IF EXISTS "Admins write knowledge_base"         ON public.knowledge_base;
DROP POLICY IF EXISTS "Admins update knowledge_base"        ON public.knowledge_base;
DROP POLICY IF EXISTS "Admins delete knowledge_base"        ON public.knowledge_base;

CREATE POLICY "Authenticated read knowledge_base" ON public.knowledge_base
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins write knowledge_base" ON public.knowledge_base
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());

CREATE POLICY "Admins update knowledge_base" ON public.knowledge_base
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "Admins delete knowledge_base" ON public.knowledge_base
  FOR DELETE TO authenticated USING (private.is_admin());

-- ── Verify ─────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
-- WHERE tablename IN ('trends', 'knowledge_base') ORDER BY tablename, policyname;
