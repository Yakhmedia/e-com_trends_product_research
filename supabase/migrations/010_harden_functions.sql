-- ============================================================
-- 010_harden_functions.sql
-- Clear the advisor findings introduced by 006/007/009.
--
-- Everything in the `public` schema is exposed through PostgREST, so
-- public.is_admin() and public.handle_new_user() were both callable by
-- anon and authenticated at /rest/v1/rpc/<name>.
--
-- is_admin() cannot simply have EXECUTE revoked: RLS policy expressions
-- are evaluated with the querying user's privileges, so revoking breaks
-- every policy that calls it ("permission denied for function is_admin").
-- It moves to a `private` schema instead, which PostgREST does not
-- expose — the remediation the linter itself recommends.
-- Run AFTER 009_rate_limits.sql.
-- ============================================================

-- ── A schema outside the exposed API surface ─────────────────
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, anon;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$func$;

-- anon needs EXECUTE too: without it an anonymous read of trends errors
-- with "permission denied" instead of cleanly returning zero rows.
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, anon;

-- ── Repoint the policies, then drop the public copy ──────────
DROP POLICY IF EXISTS "Admins read trends"          ON public.trends;
DROP POLICY IF EXISTS "Admins insert trends"        ON public.trends;
DROP POLICY IF EXISTS "Admins delete trends"        ON public.trends;
DROP POLICY IF EXISTS "Admins read knowledge_base"  ON public.knowledge_base;

CREATE POLICY "Admins read trends"   ON public.trends FOR SELECT USING (private.is_admin());
CREATE POLICY "Admins insert trends" ON public.trends FOR INSERT WITH CHECK (private.is_admin());
CREATE POLICY "Admins delete trends" ON public.trends FOR DELETE USING (private.is_admin());

CREATE POLICY "Admins read knowledge_base" ON public.knowledge_base
  FOR SELECT USING (private.is_admin());

DROP FUNCTION IF EXISTS public.is_admin();

-- ── Trigger function: not for client hands ───────────────────
-- A trigger function errors if invoked directly over RPC, but there is no
-- reason to leave it callable. Revoking from PUBLIC also strips the auth
-- server's implicit grant, so re-grant explicitly or invites break.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, postgres, service_role;

-- ── rate_limits: make the deny-all intent explicit ───────────
-- RLS is on with no policies, which already denies every client. Stating
-- it as a policy documents the intent and clears the advisor's INFO note.
-- The service-role key bypasses RLS and is unaffected.
DROP POLICY IF EXISTS "No client access to rate limits" ON public.rate_limits;
CREATE POLICY "No client access to rate limits" ON public.rate_limits
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
