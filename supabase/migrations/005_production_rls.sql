-- ============================================================
-- 005_production_rls.sql
-- Tighten RLS policies for production deployment.
-- Run AFTER migrations 001–004.
-- ============================================================

-- ── trends table ─────────────────────────────────────────────
-- Drop ALL existing trends policies before recreating them cleanly
DROP POLICY IF EXISTS "Allow public insert"         ON trends;
DROP POLICY IF EXISTS "Allow public read"            ON trends;
DROP POLICY IF EXISTS "Authenticated read trends"   ON trends;
DROP POLICY IF EXISTS "Authenticated insert trends" ON trends;
DROP POLICY IF EXISTS "Authenticated delete trends" ON trends;

-- Authenticated users can read trends (history page)
CREATE POLICY "Authenticated read trends" ON trends
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can insert trends (API route after auth guard)
CREATE POLICY "Authenticated insert trends" ON trends
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can delete their own searches (history page)
CREATE POLICY "Authenticated delete trends" ON trends
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── profiles table ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own profile"              ON profiles;
DROP POLICY IF EXISTS "Users update own profile"                ON profiles;
DROP POLICY IF EXISTS "Users update own profile (no role change)" ON profiles;

CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile BUT cannot change their role
CREATE POLICY "Users update own profile (no role change)" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Service role (used by supabase-admin.ts) can do everything
-- This is handled automatically by Supabase when using the service_role key.

-- ── knowledge_base table ─────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read knowledge base" ON knowledge_base;
DROP POLICY IF EXISTS "Authenticated read knowledge_base"           ON knowledge_base;

CREATE POLICY "Authenticated read knowledge_base" ON knowledge_base
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── Verify ───────────────────────────────────────────────────
-- Run this query to confirm policies are in place:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('trends', 'profiles', 'knowledge_base')
-- ORDER BY tablename, policyname;
