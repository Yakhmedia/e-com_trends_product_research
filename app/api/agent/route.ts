import { NextRequest } from "next/server";
import { convertToModelMessages, type UIMessage } from "ai";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTrendsData } from "@/lib/validate-trends";
import { classifyTrend } from "@/lib/trend-classifier";
import { classifyUpstreamError } from "@/lib/agent-errors";
import { resolveCandidates } from "@/lib/agent-provider";
import { streamWithFallback } from "@/lib/agent-stream";
import { touchCredential, markCredential, type CredentialStatus } from "@/lib/credentials";
import { logUsage, serverTrialUsed, SERVER_TRIAL_LIMIT } from "@/lib/usage";
import { TrendsData } from "@/lib/types";

const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60 * 60;

// History past this many turns is dropped before the model sees it — the old
// route hard-broke at message 41 with no trimming at all.
const MAX_HISTORY_MESSAGES = 24;

// Phase 5.6 — 600 was too tight for the strategy answers the prompt asks for.
const MAX_OUTPUT_TOKENS = 2000;

// ── Stable system prefix (Phase 5.5 — mark cacheable, keep volatile data after) ─
const SYSTEM_PREFIX = `You are an expert e-commerce product research analyst embedded in a Google Trends dashboard.
Your job: help users identify profitable products, understand market demand, plan sourcing, and make data-driven decisions.
Be concise, specific, and actionable. Use bullet points for lists. No fluff. Format with Markdown.`;

// ── Knowledge base search (Phase 0.1/0.2 — to_tsquery over the generated tsv) ──
async function searchKnowledgeBase(query: string, limit = 3): Promise<string> {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" | ");
  if (!terms) return "";

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("knowledge_base")
    .select("title, content")
    .textSearch("tsv", terms, { config: "english" })
    .limit(limit);

  if (error) {
    console.error("[api/agent] knowledge base search failed:", error.message);
    Sentry.captureException(new Error(`Knowledge base search failed: ${error.message}`), {
      level: "warning",
      tags: { subsystem: "knowledge-base" },
    });
    return "";
  }

  if (!data?.length) {
    const keyword = query.split(" ")[0];
    const { data: fallback } = await admin
      .from("knowledge_base")
      .select("title, content")
      .ilike("content", `%${keyword}%`)
      .limit(2);
    if (!fallback?.length) {
      console.warn(`[api/agent] knowledge base returned no rows for terms: "${terms}"`);
      return "";
    }
    return fallback.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
  }
  return data.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
}

function volatileContext(trends: TrendsData | null, kbContext: string): string {
  const parts: string[] = [];

  if (trends) {
    const iot = trends.interest_over_time;
    const classification = classifyTrend(iot);
    parts.push(`━━━ CURRENT DASHBOARD DATA ━━━
Keyword: "${trends.keyword}"
Date range: ${trends.date_range}
Data points: ${iot.length}
Latest interest: ${iot[iot.length - 1]?.value ?? "N/A"}/100
Peak interest: ${iot.reduce((m, d) => Math.max(m, d.value), 0)}/100
Avg interest: ${Math.round(iot.reduce((s, d) => s + d.value, 0) / (iot.length || 1))}/100

Trend classification: ${classification.type} (${classification.confidence}% confidence)
Classification note: ${classification.description}

Top regions: ${trends.interest_by_region.slice(0, 5).map((r) => `${r.location} (${r.value})`).join(", ")}
Top queries: ${trends.related_queries_top.slice(0, 5).map((q) => q.query).join(", ")}
Rising queries: ${trends.related_queries_rising.slice(0, 5).map((q) => `${q.query} (+${q.value}%)`).join(", ")}
Rising topics: ${trends.related_topics_rising.slice(0, 3).map((t) => t.query).join(", ")}`);
  } else {
    parts.push("No trend data loaded yet. Ask the user to search for a keyword first.");
  }

  if (kbContext) parts.push(`━━━ KNOWLEDGE BASE CONTEXT ━━━\n${kbContext}`);
  return parts.join("\n\n");
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return "";
}

export async function POST(req: NextRequest) {
  const authed = await getUser();
  if (!authed) {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
  const userId = authed.user.id;

  let body: { messages?: unknown; trendsContext?: unknown; provider?: unknown; model?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body", code: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 200) {
    return Response.json(
      { error: "messages must be a non-empty array", code: "bad_request" },
      { status: 400 }
    );
  }
  const uiMessages = (body.messages as UIMessage[]).slice(-MAX_HISTORY_MESSAGES);

  const candidates = await resolveCandidates(userId, {
    provider: body.provider,
    model: body.model,
  });
  if ("error" in candidates) {
    return Response.json(
      {
        error: "The analyst needs a provider API key. Add one under Settings.",
        code: "not_configured",
      },
      { status: 503 }
    );
  }
  const primary = candidates[0];

  // Phase 4.1 — a keyless user gets a hard lifetime trial on the shared key.
  if (primary.source === "server") {
    let used: number;
    try {
      used = await serverTrialUsed(userId);
    } catch (err) {
      // Fail closed: the shared key must not keep spending during a DB blip.
      Sentry.captureException(err, { tags: { subsystem: "agent", code: "trial_check" } });
      return Response.json(
        { error: "Could not verify your trial usage. Try again shortly.", code: "upstream_down" },
        { status: 503 }
      );
    }
    if (used >= SERVER_TRIAL_LIMIT) {
      return Response.json(
        {
          error: `Your ${SERVER_TRIAL_LIMIT}-message trial is used up. Add your own provider key in Settings to continue.`,
          code: "trial_exhausted",
        },
        { status: 402 }
      );
    }
  }

  // Phase 4.2 — fail open for BYOK (user's own money), fail closed for the
  // shared server key.
  const rate = await checkRateLimit("agent", userId, RATE_LIMIT, RATE_WINDOW_SECONDS, {
    failOpen: primary.source === "byok",
  });
  if (!rate.allowed) {
    return Response.json(
      { error: `Rate limit exceeded. Max ${RATE_LIMIT} messages per hour.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(uiMessages);
  } catch {
    return Response.json(
      { error: "Malformed message history", code: "bad_request" },
      { status: 400 }
    );
  }

  const trends = isTrendsData(body.trendsContext) ? body.trendsContext : null;
  const kbContext = await searchKnowledgeBase(lastUserText(uiMessages));
  const system = `${SYSTEM_PREFIX}\n\n${volatileContext(trends, kbContext)}`;
  const startedAt = Date.now();

  try {
    return streamWithFallback({
      candidates,
      system,
      messages: modelMessages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.65,
      abortSignal: req.signal,
      originalMessages: uiMessages,
      onCandidateFailed: (cand, code) => {
        console.warn(`[api/agent] ${cand.provider} failed (${code}); trying next candidate`);
        Sentry.captureMessage(`agent provider fell back from ${cand.provider}`, {
          level: "warning",
          tags: { subsystem: "agent", provider: cand.provider, code },
        });
        if (cand.source === "byok") {
          const status: CredentialStatus | null =
            code === "no_credits" ? "no_credits" : code === "bad_key" ? "invalid" : null;
          if (status) markCredential(userId, cand.provider, status).catch(() => {});
        }
      },
      onAnswered: (cand, usage, finishReason) => {
        if (cand.source === "byok") {
          touchCredential(userId, cand.provider).catch(() => {});
        }
        logUsage({
          userId,
          provider: cand.provider,
          model: cand.modelId,
          keySource: cand.source,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          finishReason: finishReason ?? null,
          latencyMs: Date.now() - startedAt,
        }).catch(() => {});
      },
    });
  } catch (err) {
    const c = classifyUpstreamError(err);
    console.error(`[api/agent] failed (${c.code}):`, err);
    Sentry.captureException(err, { tags: { subsystem: "agent", code: c.code } });
    return Response.json({ error: c.message, code: c.code }, { status: c.status });
  }
}
