// Server-only. Per-request usage logging (Phase 4.3) and the keyless trial
// quota it backs (Phase 4.1).
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdminClient } from "./supabase-admin";
import { Provider, getModel, estimateCost } from "./models";

// Lifetime messages a user may send on the shared server key before a BYOK
// key is required. Tracked as rows in public.usage_log (key_source = 'server').
export const SERVER_TRIAL_LIMIT = 20;

export interface UsageRecord {
  userId: string;
  provider: Provider;
  model: string;
  keySource: "byok" | "server";
  inputTokens?: number | null;
  outputTokens?: number | null;
  finishReason?: string | null;
  latencyMs?: number | null;
}

export async function logUsage(rec: UsageRecord): Promise<void> {
  const info = getModel(rec.provider, rec.model);
  const cost =
    info && rec.inputTokens != null && rec.outputTokens != null
      ? Number(estimateCost(info, rec.inputTokens, rec.outputTokens).toFixed(6))
      : null;

  const { error } = await getSupabaseAdminClient().from("usage_log").insert({
    user_id: rec.userId,
    provider: rec.provider,
    model: rec.model,
    key_source: rec.keySource,
    input_tokens: rec.inputTokens ?? null,
    output_tokens: rec.outputTokens ?? null,
    estimated_cost_usd: cost,
    finish_reason: rec.finishReason ?? null,
    latency_ms: rec.latencyMs ?? null,
  });

  if (error) {
    console.error("[usage] logUsage failed:", error.message);
    Sentry.captureException(new Error(`logUsage failed: ${error.message}`), {
      level: "warning",
      tags: { subsystem: "usage" },
    });
  }
}

/** Messages this user has already spent on the shared server key. */
export async function serverTrialUsed(userId: string): Promise<number> {
  const { count, error } = await getSupabaseAdminClient()
    .from("usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("key_source", "server");

  if (error) throw new Error(`serverTrialUsed failed: ${error.message}`);
  return count ?? 0;
}
