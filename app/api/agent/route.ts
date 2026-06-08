import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ChatMessage, TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";

// Lazy — instantiated on first request, not at module load (prevents build crash)
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(userId, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

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

  const { data } = await adminClient
    .from("knowledge_base")
    .select("title, content, category")
    .textSearch("content", words, { type: "websearch", config: "english" })
    .limit(limit);

  if (!data?.length) {
    const keyword = query.split(" ")[0];
    const { data: fallback } = await adminClient
      .from("knowledge_base")
      .select("title, content")
      .ilike("content", `%${keyword}%`)
      .limit(2);
    if (!fallback?.length) return "";
    return fallback.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
  }

  return data.map((r) => `[${r.title}]\n${r.content}`).join("\n\n");
}

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 60 messages per hour." },
      { status: 429, headers: { "Retry-After": "3600" } }
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
}
