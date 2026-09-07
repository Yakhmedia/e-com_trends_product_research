// Server-only. NEVER import from a client component — it reaches the service
// role key and Vault. Use only inside route handlers after an auth guard.
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdminClient } from "./supabase-admin";
import { Provider } from "./models";

// Phase 2.2 — the only module that touches a user's BYOK key.
//
// Rules:
//   - never cache a plaintext key in a module-level variable (that would
//     recreate the `_openai` singleton bug while holding a secret)
//   - never log a key; never put one in an error message or Sentry event
//   - decryption is service-role only and the result is used in-memory only

export type CredentialStatus = "untested" | "valid" | "invalid" | "no_credits";

export interface CredentialMeta {
  provider: Provider;
  key_hint: string;
  default_model: string | null;
  status: CredentialStatus;
  last_verified_at: string | null;
  last_used_at: string | null;
  updated_at: string;
}

// ── Format checks (cheap, pre-network) ───────────────────────────────────────
const FORMAT: Record<Provider, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  google: /^[A-Za-z0-9_-]{30,120}$/,
};

export function validateKeyFormat(provider: Provider, key: string): string | null {
  if (!key || key.length > 512) return "That doesn't look like a valid key.";
  if (!FORMAT[provider].test(key.trim())) {
    return `That doesn't look like a ${provider} API key.`;
  }
  return null;
}

export function keyHint(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return "…";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// ── DB helpers (service-role) ────────────────────────────────────────────────
export async function listCredentials(userId: string): Promise<CredentialMeta[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("provider_credentials")
    .select("provider, key_hint, default_model, status, last_verified_at, last_used_at, updated_at")
    .eq("user_id", userId);
  if (error) throw new Error(`listCredentials failed: ${error.message}`);
  return (data ?? []) as CredentialMeta[];
}

export async function saveCredential(
  userId: string,
  provider: Provider,
  key: string,
  defaultModel?: string | null
): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("save_provider_credential", {
    p_user_id: userId,
    p_provider: provider,
    p_secret: key.trim(),
    p_hint: keyHint(key),
    p_default_model: defaultModel ?? null,
  });
  if (error) throw new Error(`saveCredential failed: ${error.message}`);
}

/** Service-role only. The return value must stay in memory — never persisted or logged. */
export async function getDecryptedKey(
  userId: string,
  provider: Provider
): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().rpc("get_provider_credential_secret", {
    p_user_id: userId,
    p_provider: provider,
  });
  if (error) throw new Error(`getDecryptedKey failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function deleteCredential(userId: string, provider: Provider): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("delete_provider_credential", {
    p_user_id: userId,
    p_provider: provider,
  });
  if (error) throw new Error(`deleteCredential failed: ${error.message}`);
}

export async function setDefaultModel(
  userId: string,
  provider: Provider,
  model: string
): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("set_provider_default_model", {
    p_user_id: userId,
    p_provider: provider,
    p_model: model,
  });
  if (error) throw new Error(`setDefaultModel failed: ${error.message}`);
}

export async function markCredential(
  userId: string,
  provider: Provider,
  status: CredentialStatus
): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("mark_provider_credential", {
    p_user_id: userId,
    p_provider: provider,
    p_status: status,
  });
  if (error) console.error(`[credentials] markCredential failed: ${error.message}`);
}

export async function touchCredential(userId: string, provider: Provider): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("touch_provider_credential", {
    p_user_id: userId,
    p_provider: provider,
  });
  if (error) console.error(`[credentials] touchCredential failed: ${error.message}`);
}

// ── Probe (Phase 2.4 — validate on save) ─────────────────────────────────────
// A cheap, read-only call that distinguishes a working key from a bad one at
// the moment of paste, instead of three days later as "AI analyst unavailable".
// A working key with no funds still probes "valid" here — quota only shows on a
// real completion (agent-errors.ts maps that to `no_credits`).
export async function probeCredential(
  provider: Provider,
  key: string
): Promise<CredentialStatus> {
  try {
    const res = await probeRequest(provider, key.trim());
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    if (res.status === 429) {
      // Could be rate limit or quota; a bad key never 429s on a models list.
      const body = await res.text().catch(() => "");
      return /quota|billing|insufficient/i.test(body) ? "no_credits" : "valid";
    }
    return "invalid";
  } catch (err) {
    Sentry.captureException(err, { tags: { subsystem: "credentials-probe", provider } });
    // Network failure on our side — don't brand the user's key invalid.
    return "untested";
  }
}

function probeRequest(provider: Provider, key: string): Promise<Response> {
  const timeout = AbortSignal.timeout(10_000);
  switch (provider) {
    case "openai":
      return fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: timeout,
      });
    case "anthropic":
      return fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: timeout,
      });
    case "google":
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: timeout }
      );
  }
}
