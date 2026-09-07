# BYOK provider keys — storage, rotation, incident response

**Status:** current as of Phase 2 of `IMPLEMENTATION_AI_AGENT_PLAN.md`

## How a key is stored

1. The user pastes a key into `/settings`. `POST /api/credentials` validates the
   format, runs a read-only probe against the provider, then calls
   `saveCredential()` (`lib/credentials.ts`).
2. `saveCredential()` calls the `public.save_provider_credential(...)` SQL
   function (migration `014`), which:
   - `vault.create_secret(key, 'pc_<user>_<provider>', …)` → returns a UUID
   - inserts `public.provider_credentials` with **only** that UUID, a display
     hint (`sk-…4f2a`), the chosen model, and a status.
3. The plaintext key exists only:
   - in the request body (TLS, not logged)
   - inside Supabase Vault, encrypted with a key Supabase manages
   - briefly in server memory during an agent call (`getDecryptedKey()` →
     provider SDK), never cached in a module variable.

`public.provider_credentials` never contains the key. RLS lets a user read
their own row's metadata; every write and every decryption goes through a
`SECURITY DEFINER` function granted to `service_role` only.

## Rotation — a user rotating their own key

`/settings` → **Replace** → paste the new key → Save. This calls
`save_provider_credential`, which runs `vault.update_secret(secret_id, newKey)`
in place — the `vault_secret_id` and the table row are unchanged, `status`
resets to `untested` and is re-probed on save.

## Rotation — the Vault encryption key (Supabase-managed)

There is no `CREDENTIALS_ENCRYPTION_KEY` in this app to rotate. Vault's root
key is managed by Supabase. If Supabase rotates it, existing secrets are
re-wrapped transparently; no action here.

## Incident response — a user's key is suspected leaked

1. The user should revoke the key at the provider immediately (OpenAI /
   Anthropic / Google console). That is the only step that actually stops use.
2. In this app: `/settings` → **Remove**, or run
   `select public.delete_provider_credential('<user-uuid>', '<provider>');`
   which deletes the row and `DELETE`s the Vault secret.
3. Check Sentry for any event that might have carried the key. The
   `beforeSend` scrubber (`lib/sentry-scrub.ts`) redacts `sk-…`, `sk-ant-…`,
   `AIza…`, and bearer tokens plus known auth headers, but confirm.

## Incident response — the service-role key is leaked

The service-role key can call `get_provider_credential_secret` for **any**
user and decrypt **every** stored BYOK key. If `SUPABASE_SERVICE_ROLE_KEY`
leaks:

1. Rotate it in the Supabase dashboard (Settings → API → "Reset service role
   key") and redeploy with the new value.
2. Treat every stored BYOK key as compromised — notify users to rotate at
   their providers.

## Auditing

`public.provider_credentials` carries `created_at`, `updated_at`,
`last_verified_at`, `last_used_at`. Per-request provider/model/token usage is
logged separately (Phase 4.3, `public.usage_log`).
