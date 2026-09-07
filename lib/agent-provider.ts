// Server-only. Resolves the ordered list of provider+model+key candidates a
// user's agent call may run on, and returns ready Vercel AI SDK models.
//
// Preference order:
//   1. an explicitly requested provider the user holds a key for
//   2. the user's other keys, best status first (valid > untested >
//      no_credits), then most-recently-updated
//   3. the shared server key (OPENAI_API_KEY) — a keyless trial (Phase 4.1)
//
// The route uses candidates[0] and, on a `no_credits` / `bad_key` / rate-limit
// failure, marks that credential so the *next* request routes around it
// automatically (Phase 5 — self-healing across requests).
import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Provider, defaultModelFor, isKnownModel, isProvider } from "./models";
import { listCredentials, getDecryptedKey, type CredentialStatus } from "./credentials";

export interface ResolvedModel {
  provider: Provider;
  modelId: string;
  model: LanguageModel;
  source: "byok" | "server";
}

export type ResolveError = "not_configured";

const SERVER_FALLBACK = { provider: "openai" as const, modelId: "gpt-4o-mini" };

const STATUS_RANK: Record<CredentialStatus, number> = {
  valid: 0,
  untested: 1,
  no_credits: 2,
  invalid: 99,
};

function buildModel(provider: Provider, apiKey: string, modelId: string): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
  }
}

function pickModelId(
  provider: Provider,
  requested: unknown,
  credentialDefault: string | null
): string {
  if (typeof requested === "string" && isKnownModel(provider, requested)) return requested;
  if (credentialDefault && isKnownModel(provider, credentialDefault)) return credentialDefault;
  return defaultModelFor(provider).id;
}

export async function resolveCandidates(
  userId: string,
  opts: { provider?: unknown; model?: unknown } = {}
): Promise<ResolvedModel[] | { error: ResolveError }> {
  const credentials = (await listCredentials(userId)).filter((c) => c.status !== "invalid");

  credentials.sort((a, b) => {
    // Explicitly requested provider first.
    if (isProvider(opts.provider)) {
      if (a.provider === opts.provider && b.provider !== opts.provider) return -1;
      if (b.provider === opts.provider && a.provider !== opts.provider) return 1;
    }
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return b.updated_at.localeCompare(a.updated_at);
  });

  const candidates: ResolvedModel[] = [];
  for (const cred of credentials) {
    const key = await getDecryptedKey(userId, cred.provider);
    if (!key) continue;
    const modelId = pickModelId(cred.provider, opts.model, cred.default_model);
    candidates.push({
      provider: cred.provider,
      modelId,
      model: buildModel(cred.provider, key, modelId),
      source: "byok",
    });
  }

  const serverKey = process.env.OPENAI_API_KEY;
  if (serverKey) {
    candidates.push({
      provider: SERVER_FALLBACK.provider,
      modelId: SERVER_FALLBACK.modelId,
      model: createOpenAI({ apiKey: serverKey })(SERVER_FALLBACK.modelId),
      source: "server",
    });
  }

  return candidates.length > 0 ? candidates : { error: "not_configured" };
}

/** Convenience: the single best candidate (or an error). */
export async function resolveModel(
  userId: string,
  opts: { provider?: unknown; model?: unknown } = {}
): Promise<ResolvedModel | { error: ResolveError }> {
  const result = await resolveCandidates(userId, opts);
  if ("error" in result) return result;
  return result[0];
}
