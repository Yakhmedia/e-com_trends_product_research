import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { ChatMessage, TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Search knowledge base using Postgres full-text search ──────────────────
async function searchKnowledgeBase(query: string, limit = 3): Promise<string> {
  // Build a tsquery from the top words in the user message
  const words = query
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" | ");

  if (!words) return "";

  const { data } = await supabase
    .from("knowledge_base")
    .select("title, content, category")
    .textSearch("content", words, { type: "websearch", config: "english" })
    .limit(limit);

  if (!data?.length) {
    // Fallback: keyword overlap via ilike
    const keyword = query.split(" ")[0];
    const { data: fallback } = await supabase
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
  const {
    messages,
    trendsContext,
  }: { messages: ChatMessage[]; trendsContext?: TrendsData } = await req.json();

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // ── Parallel: knowledge base search ───────────────────────────────────────
  const kbContext = await searchKnowledgeBase(lastUserMessage);

  // ── Trend classification ────────────────────────────────────────────────
  const classification = trendsContext
    ? classifyTrend(trendsContext.interest_over_time)
    : null;

  // ── Build system prompt ────────────────────────────────────────────────
  const systemPrompt = `You are an expert e-commerce product research analyst embedded in a Google Trends dashboard.
Your job: help users identify profitable products, understand market demand, plan sourcing, and make data-driven decisions.
Be concise, specific, and actionable. Use bullet points for lists. No fluff.

${
  trendsContext
    ? `
━━━ CURRENT DASHBOARD DATA ━━━
Keyword: "${trendsContext.keyword}"
Date range: ${trendsContext.date_range}
Data points: ${trendsContext.interest_over_time.length}
Latest interest: ${trendsContext.interest_over_time[trendsContext.interest_over_time.length - 1]?.value ?? "N/A"}/100
Peak interest: ${Math.max(...trendsContext.interest_over_time.map((d) => d.value), 0)}/100
Avg interest: ${Math.round(trendsContext.interest_over_time.reduce((s, d) => s + d.value, 0) / (trendsContext.interest_over_time.length || 1))}/100

Trend classification: ${classification?.type} (${classification?.confidence}% confidence)
Classification note: ${classification?.description}

Top regions: ${trendsContext.interest_by_region
    .slice(0, 5)
    .map((r) => `${r.location} (${r.value})`)
    .join(", ")}

Top queries: ${trendsContext.related_queries_top
    .slice(0, 5)
    .map((q) => q.query)
    .join(", ")}

Rising queries: ${trendsContext.related_queries_rising
    .slice(0, 5)
    .map((q) => `${q.query} (+${q.value}%)`)
    .join(", ")}

Rising topics: ${trendsContext.related_topics_rising
    .slice(0, 3)
    .map((t) => t.query)
    .join(", ")}
`
    : "No trend data loaded yet. Ask the user to search for a keyword first."
}

${
  kbContext
    ? `━━━ KNOWLEDGE BASE CONTEXT ━━━
${kbContext}`
    : ""
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 600,
    temperature: 0.65,
  });

  return NextResponse.json({
    message: completion.choices[0].message.content,
  });
}
