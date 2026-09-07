import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as Sentry from "@sentry/nextjs";
import { getAdminUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { ChatMessage, TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";

// Lazy — instantiated on first request, not at module load (prevents build crash)
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Backed by public.rate_limits — see lib/rate-limit.ts.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60 * 60;

// ── Knowledge base search ─────────────────────────────────────────────────────
async function searchKnowledgeBase(query: string, limit = 3): Promise<string> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" | ");

  if (!words) return "";

  const adminClient = getSupabaseAdminClient();

  const { data, error } = await adminClient
    .from("knowledge_base")
    .select("title, content, category")
    .textSearch("content", words, { type: "websearch", config: "english" })
    .limit(limit);

  if (error) {
    // Most likely cause: SUPABASE_SERVICE_ROLE_KEY missing, so this is an anon
    // client and the admin-only RLS policy (migration 007) hides every row.
    // Silently losing the agent's grounding context is worse than knowing.
    console.error("[api/agent] knowledge base search failed:", error.message);
    Sentry.captureException(new Error(`Knowledge base search failed: ${error.message}`), {
      level: "warning",
      tags: { subsystem: "knowledge-base" },
    });
    return "";
  }

  if (!data?.length) {
    const keyword = query.split(" ")[0];
    const { data: fallback } = await adminClient
      .from("knowledge_base")
      .select("title, content")
      .ilike("content", `%${keyword}%`)
      .limit(2);
    if (!fallback?.length) {
      // The agent still answers, but ungrounded. Surface it rather than let an
      // empty or unreadable table degrade every answer invisibly.
      console.warn(`[api/agent] knowledge base returned no rows for terms: "${words}"`);
      Sentry.captureMessage("Knowledge base search returned no results", {
        level: "warning",
        tags: { subsystem: "knowledge-base" },
        extra: { terms: words },
      });
      return "";
    }
    return fallback.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
  }

  return data.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
}

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    console.error("[api/agent] OPENAI_API_KEY is not configured");
    return NextResponse.json(
      { error: "AI analyst is not configured on the server." },
      { status: 503 }
    );
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rate = await checkRateLimit("agent", user.id, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Max ${RATE_LIMIT} messages per hour.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  // ── Input validation ──────────────────────────────────────────────────────
  let body: { messages?: unknown; trendsContext?: unknown };
  try {
    body = await req.json() as { messages?: unknown; trendsContext?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, trendsContext } = body;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return NextResponse.json({ error: "messages must be an array of 1–40 items" }, { status: 400 });
  }

  const validMessages = (messages as ChatMessage[]).filter(
    (m) => (m.role === "user" || m.role === "assistant") &&
           typeof m.content === "string" &&
           m.content.length <= 4000
  );

  if (validMessages.length === 0) {
    return NextResponse.json({ error: "No valid messages" }, { status: 400 });
  }

  const trends = trendsContext as TrendsData | undefined;
  const lastUserMessage = [...validMessages].reverse().find((m) => m.role === "user")?.content ?? "";

  // ── Knowledge base + classification ──────────────────────────────────────
  const kbContext = await searchKnowledgeBase(lastUserMessage);
  const classification = trends ? classifyTrend(trends.interest_over_time) : null;

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `You are an expert e-commerce product research analyst embedded in a Google Trends dashboard.
Your job: help users identify profitable products, understand market demand, plan sourcing, and make data-driven decisions.
Be concise, specific, and actionable. Use bullet points for lists. No fluff.

${trends ? `
━━━ CURRENT DASHBOARD DATA ━━━
Keyword: "${trends.keyword}"
Date range: ${trends.date_range}
Data points: ${trends.interest_over_time.length}
Latest interest: ${trends.interest_over_time[trends.interest_over_time.length - 1]?.value ?? "N/A"}/100
Peak interest: ${Math.max(...trends.interest_over_time.map((d) => d.value), 0)}/100
Avg interest: ${Math.round(trends.interest_over_time.reduce((s, d) => s + d.value, 0) / (trends.interest_over_time.length || 1))}/100

Trend classification: ${classification?.type} (${classification?.confidence}% confidence)
Classification note: ${classification?.description}

Top regions: ${trends.interest_by_region.slice(0, 5).map((r) => `${r.location} (${r.value})`).join(", ")}
Top queries: ${trends.related_queries_top.slice(0, 5).map((q) => q.query).join(", ")}
Rising queries: ${trends.related_queries_rising.slice(0, 5).map((q) => `${q.query} (+${q.value}%)`).join(", ")}
Rising topics: ${trends.related_topics_rising.slice(0, 3).map((t) => t.query).join(", ")}
` : "No trend data loaded yet. Ask the user to search for a keyword first."}

${kbContext ? `━━━ KNOWLEDGE BASE CONTEXT ━━━\n${kbContext}` : ""}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...validMessages,
      ],
      max_tokens: 600,
      temperature: 0.65,
    });

    return NextResponse.json({ message: completion.choices[0].message.content });
  } catch (err) {
    // An upstream failure (quota, outage, revoked key) would otherwise surface
    // as an unhandled 500 with no message the UI can render.
    console.error("[api/agent] completion failed:", err);
    Sentry.captureException(err, { tags: { subsystem: "openai" } });
    return NextResponse.json(
      { error: "The AI analyst is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
