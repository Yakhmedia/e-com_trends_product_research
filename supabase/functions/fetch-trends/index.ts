// Supabase Edge Function — deploy with: supabase functions deploy fetch-trends
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERP_API_KEY = Deno.env.get("SERP_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

function serpUrl(q: string, dataType: string) {
  return `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(q)}&data_type=${dataType}&api_key=${SERP_API_KEY}`;
}

async function safeFetch(url: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

function extractTimeline(d: Record<string, unknown>) {
  const rows = (d?.interest_over_time as Record<string, unknown>)?.timeline_data as Record<string, unknown>[] ?? [];
  return rows.map((p) => {
    const vs = p.values as { extracted_value?: number; value?: number }[] ?? [];
    return { date: p.date as string, value: vs[0]?.extracted_value ?? vs[0]?.value ?? 0 };
  });
}

function extractRegions(d: Record<string, unknown>) {
  const raw = d?.interest_by_region;
  const rows = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
  return rows
    .map((r) => ({ location: r.location as string, value: (r.extracted_value as number) ?? (r.value as number) ?? 0 }))
    .filter((r) => r.location && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

function extractQueries(d: Record<string, unknown>, type: "top" | "rising") {
  const rows = ((d?.related_queries as Record<string, unknown>)?.[type] as Record<string, unknown>[]) ?? [];
  return rows.slice(0, 10).map((q) => ({ query: q.query as string, value: String(q.extracted_value ?? q.value ?? ""), link: q.link }));
}

function extractTopics(d: Record<string, unknown>, type: "top" | "rising") {
  const rows = ((d?.related_topics as Record<string, unknown>)?.[type] as Record<string, unknown>[]) ?? [];
  return rows.slice(0, 10).map((t) => ({
    query: (t.topic as Record<string, string>)?.title ?? (t.query as string) ?? "",
    value: String(t.extracted_value ?? t.value ?? ""),
    link: t.link,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const keyword = new URL(req.url).searchParams.get("keyword")?.toLowerCase().trim();
  if (!keyword) return new Response(JSON.stringify({ error: "keyword required" }), { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase.from("trends").select("*").eq("keyword", keyword)
    .gte("fetched_at", sixHoursAgo).order("fetched_at", { ascending: false }).limit(1).single();

  if (cached) return new Response(JSON.stringify({ data: cached, cached: true }), { headers: { "Content-Type": "application/json", ...CORS } });

  const [timelineData, geoData, queriesData, topicsData] = await Promise.all([
    safeFetch(serpUrl(keyword, "TIMESERIES")),
    safeFetch(serpUrl(keyword, "GEO_MAP_0")),
    safeFetch(serpUrl(keyword, "RELATED_QUERIES")),
    safeFetch(serpUrl(keyword, "RELATED_TOPICS")),
  ]);

  const payload = {
    keyword,
    interest_over_time:     extractTimeline(timelineData),
    interest_by_region:     extractRegions(geoData),
    related_queries_top:    extractQueries(queriesData, "top"),
    related_queries_rising: extractQueries(queriesData, "rising"),
    related_topics_top:     extractTopics(topicsData, "top"),
    related_topics_rising:  extractTopics(topicsData, "rising"),
  };

  const { data: saved } = await supabase.from("trends").insert(payload).select().single();
  return new Response(JSON.stringify({ data: saved ?? payload, cached: false }), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
});
