-- ============================================================
-- 008_access_token_hook.sql
-- Put the user's role in the JWT so the proxy stops querying the
-- database on every single page and API request.
--
-- REQUIRES A DASHBOARD STEP:
--   Authentication → Hooks → Customize Access Token (JWT) Claims
--   → enable, and select public.custom_access_token_hook
-- Until that is enabled the claim is simply absent and proxy.ts falls
-- back to the profiles query, so applying this alone is safe.
-- Run AFTER 007_admin_rls.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $func$
DECLARE
  claims    jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- jsonb_set is a no-op on a missing parent path, so ensure it exists.
  IF claims->'app_metadata' IS NULL THEN
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  END IF;

  -- Default to the least-privileged role when no profile row exists yet.
  claims := jsonb_set(
    claims, '{app_metadata,role}', to_jsonb(COALESCE(user_role, 'viewer'))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$func$;

-- ── Grants ───────────────────────────────────────────────────
-- Only the auth server may run the hook. A client that could call it
-- directly would learn nothing useful, but there is no reason to allow it.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM authenticated, anon, public;

-- The hook runs as supabase_auth_admin, which is subject to RLS on
-- profiles and would otherwise read nothing.
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
DROP POLICY IF EXISTS "Auth admin reads profiles" ON public.profiles;
CREATE POLICY "Auth admin reads profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);

-- ── Note on staleness ────────────────────────────────────────
-- The claim is minted at token issue and lives as long as the access
-- token (1h by default). Demoting an admin therefore leaves the old
-- claim valid until refresh. getAdminUser() keeps querying profiles
-- directly and remains the authoritative server-side check.
