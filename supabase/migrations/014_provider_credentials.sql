-- ============================================================
-- 014_provider_credentials.sql
-- Phase 2.1 — per-user BYOK provider keys.
--
-- The API key itself never lands in a public table: it goes into Supabase
-- Vault (pgsodium-backed, Supabase manages the encryption key) and this
-- table stores only the returned UUID plus display metadata.
--
-- RLS lets a user READ their own row's metadata. Every write — and every
-- decryption — goes through a SECURITY DEFINER function callable only by the
-- service-role client, after the route handler's auth guard. This is the
-- same pattern as public.check_rate_limit (migration 009): a user must not
-- be able to point their `vault_secret_id` at someone else's secret.
-- Run AFTER 013_viewer_capabilities.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text        NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  vault_secret_id  uuid        NOT NULL,
  key_hint         text        NOT NULL,           -- e.g. "sk-…4f2a", display only
  default_model    text,                            -- per-provider model id
  status           text        NOT NULL DEFAULT 'untested'
                   CHECK (status IN ('untested', 'valid', 'invalid', 'no_credits')),
  last_verified_at timestamptz,
  last_used_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credentials" ON public.provider_credentials;
CREATE POLICY "Users read own credentials" ON public.provider_credentials
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- No client INSERT/UPDATE/DELETE: all writes go through the functions below.

-- ── save (create or replace) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_provider_credential(
  p_user_id       uuid,
  p_provider      text,
  p_secret        text,
  p_hint          text,
  p_default_model text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_secret_id uuid;
  v_name      text := 'pc_' || p_user_id::text || '_' || p_provider;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
  FROM public.provider_credentials
  WHERE user_id = p_user_id AND provider = p_provider;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(p_secret, v_name, 'BYOK provider key');
    INSERT INTO public.provider_credentials
      (user_id, provider, vault_secret_id, key_hint, default_model, status)
    VALUES
      (p_user_id, p_provider, v_secret_id, p_hint, p_default_model, 'untested');
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secret);
    UPDATE public.provider_credentials
    SET key_hint      = p_hint,
        default_model = COALESCE(p_default_model, default_model),
        status        = 'untested',
        last_verified_at = NULL,
        updated_at    = now()
    WHERE user_id = p_user_id AND provider = p_provider;
  END IF;
END;
$func$;

-- ── decrypt (service-role only, in-memory use) ──────────────
CREATE OR REPLACE FUNCTION public.get_provider_credential_secret(
  p_user_id  uuid,
  p_provider text
)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = ''
AS $func$
  SELECT ds.decrypted_secret
  FROM public.provider_credentials pc
  JOIN vault.decrypted_secrets ds ON ds.id = pc.vault_secret_id
  WHERE pc.user_id = p_user_id AND pc.provider = p_provider;
$func$;

-- ── set default model ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_provider_default_model(
  p_user_id  uuid,
  p_provider text,
  p_model    text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $func$
  UPDATE public.provider_credentials
  SET default_model = p_model, updated_at = now()
  WHERE user_id = p_user_id AND provider = p_provider;
$func$;

-- ── record verification outcome ────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_provider_credential(
  p_user_id  uuid,
  p_provider text,
  p_status   text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $func$
  UPDATE public.provider_credentials
  SET status = p_status,
      last_verified_at = CASE WHEN p_status <> 'untested' THEN now() ELSE last_verified_at END,
      updated_at = now()
  WHERE user_id = p_user_id AND provider = p_provider;
$func$;

-- ── record use ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_provider_credential(
  p_user_id  uuid,
  p_provider text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $func$
  UPDATE public.provider_credentials
  SET last_used_at = now()
  WHERE user_id = p_user_id AND provider = p_provider;
$func$;

-- ── delete ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_provider_credential(
  p_user_id  uuid,
  p_provider text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
  FROM public.provider_credentials
  WHERE user_id = p_user_id AND provider = p_provider;

  DELETE FROM public.provider_credentials
  WHERE user_id = p_user_id AND provider = p_provider;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$func$;

-- ── Grants: service-role only ──────────────────────────────
DO $grants$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.save_provider_credential(uuid, text, text, text, text)',
    'public.get_provider_credential_secret(uuid, text)',
    'public.set_provider_default_model(uuid, text, text)',
    'public.mark_provider_credential(uuid, text, text)',
    'public.touch_provider_credential(uuid, text)',
    'public.delete_provider_credential(uuid, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, public', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$grants$;
