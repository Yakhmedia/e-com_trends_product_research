-- ============================================================
-- 006_fix_role_default.sql
-- Stop the database handing out admin accounts.
--
-- profiles.role defaulted to 'admin', so anyone who obtained an auth
-- user (public signup was open) became an admin on first login. The
-- "Users insert own profile" policy also had no check on `role`, so a
-- client could insert role:'admin' explicitly regardless of the default.
--
-- Profile creation now belongs to a trigger on auth.users; clients never
-- insert their own row.
-- Run AFTER 005_production_rls.sql.
-- ============================================================

-- ── Default new profiles to the least-privileged role ────────
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'viewer';

-- Constrain the column to known roles (idempotent).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'viewer'));

-- ── Clients must never insert their own profile row ──────────
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

-- ── The trigger owns profile creation ────────────────────────
-- SECURITY DEFINER so it runs regardless of the (now absent) INSERT
-- policy. search_path = '' forces fully-qualified names, which stops a
-- malicious schema on the caller's search_path from shadowing `profiles`.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Notes ────────────────────────────────────────────────────
-- Changing a column default is NOT retroactive: the existing admin row
-- keeps role = 'admin'.
--
-- To promote an invited user to admin:
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
