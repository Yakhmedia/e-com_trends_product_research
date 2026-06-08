import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TrendsData, TimelineDataPoint, RegionData, RelatedQuery } from "@/lib/types";

const SERP_API_KEY = process.env.SERP_API_KEY!;

// SerpAPI requires a separate request per data_type.
// Each call returns only the data for that type.
// `date` maps to SerpAPI's `date` param: "today 12-m", "today 5-y", "2022-01-01 2022-12-31", etc.
function serpUrl(keyword: string, dataType: string, date: string) {
  return (
    `https://serpapi.com/search.json?engine=google_trends` +
    `&q=${encodeURIComponent(keyword)}` +
    `&data_type=${dataType}` +
    `&date=${encodeURIComponent(date)}` +
    `&api_key=${SERP_API_KEY}`
  );
}

async function safeFetch(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── TIMESERIES ──────────────────────────────────────────────────────────────
// Response shape: { interest_over_time: { timeline_data: [ { date, values: [{query, value, extracted_value}] } ] } }
function extractTimeline(data: Record<string, unknown>): TimelineDataPoint[] {
  const iot = data?.interest_over_time as Record<string, unknown> | undefined;
  const rows = iot?.timeline_data as Record<string, unknown>[] | undefined;
  if (!rows?.length) return [];
  return rows.map((point) => {
    const values = point.values as { extracted_value?: number; value?: number }[] | undefined;
    return {
      date: point.date as string,
      value: values?.[0]?.extracted_value ?? values?.[0]?.value ?? 0,
    };
  });
}

// ── GEO_MAP ─────────────────────────────────────────────────────────────────
// Response shape: { interest_by_region: [ { location, max_value_index, value, extracted_value } ] }
// Note: top-level array, NOT nested under a .regions key.
function extractRegions(data: Record<string, unknown>): RegionData[] {
  // SerpAPI returns interest_by_region as a direct array
  const raw = data?.interest_by_region;
  const regions = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
  if (!regions.length) return [];

  return regions
    .map((r) => ({
      location: r.location as string,
      // extracted_value is the 0-100 normalised score
      value: (r.extracted_value as number) ?? (r.value as number) ?? 0,
    }))
    .filter((r) => r.location && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

// ── RELATED_QUERIES ──────────────────────────────────────────────────────────
// Response shape: { related_queries: { top: [{query, value, extracted_value, link}], rising: [...] } }
function extractQueries(data: Record<string, unknown>, type: "top" | "rising"): RelatedQuery[] {
  const rq = data?.related_queries as Record<string, unknown> | undefined;
  const rows = rq?.[type] as Record<string, unknown>[] | undefined;
  if (!rows?.length) return [];
  return rows.slice(0, 10).map((q) => ({
    query: q.query as string,
    value: String(q.extracted_value ?? q.value ?? ""),
    link: q.link as string | undefined,
  }));
}

// ── RELATED_TOPICS ───────────────────────────────────────────────────────────
// Response shape: { related_topics: { top: [{topic:{title,type}, value:"100", extracted_value:100}],
//                                     rising: [{..., value:"Breakout", extracted_value:24800}] } }
// For rising, `value` is the human-readable label ("Breakout" or "+XX%").
// For top, `value` is a numeric string "100".
function extractTopics(data: Record<string, unknown>, type: "top" | "rising"): RelatedQuery[] {
  const rt = data?.related_topics as Record<string, unknown> | undefined;
  const rows = rt?.[type] as Record<string, unknown>[] | undefined;
  if (!rows?.length) return [];
  return rows.slice(0, 10).map((t) => {
    const topic = t.topic as Record<string, string> | undefined;
    // Use the human-readable `value` string directly ("Breakout", "+190%", "100")
    const displayValue = String(t.value ?? t.extracted_value ?? "");
    return {
      query: topic?.title ?? (t.query as string) ?? "",
      value: displayValue,
      link: t.link as string | undefined,
    };
  });
}

export async function GET(req: NextRequest) {
  const keyword  = req.nextUrl.searchParams.get("keyword");
  const dateParam = req.nextUrl.searchParams.get("date") ?? "today 12-m";
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const kw = keyword.toLowerCase().trim();

  // ── Cache check (keyed on keyword + date_range) ────────────────────────────
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from("trends")
    .select("*")
    .eq("keyword", kw)
    .eq("date_range", dateParam)
    .gte("fetched_at", sixHoursAgo)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    return NextResponse.json({ data: cached, cached: true });
  }

  // ── Parallel SerpAPI calls (one per data_type) ──────────────────────────
  const [timelineData, geoData, queriesData, topicsData] = await Promise.all([
    safeFetch(serpUrl(kw, "TIMESERIES",     dateParam)),
    safeFetch(serpUrl(kw, "GEO_MAP_0",      dateParam)),  // GEO_MAP_0 = country-level
    safeFetch(serpUrl(kw, "RELATED_QUERIES", dateParam)),
    safeFetch(serpUrl(kw, "RELATED_TOPICS",  dateParam)),
  ]);

  const trendsData: Omit<TrendsData, "id" | "fetched_at"> = {
    keyword: kw,
    date_range: dateParam,
    interest_over_time:     extractTimeline(timelineData),
    interest_by_region:     extractRegions(geoData),
    related_queries_top:    extractQueries(queriesData, "top"),
    related_queries_rising: extractQueries(queriesData, "rising"),
    related_topics_top:     extractTopics(topicsData, "top"),
    related_topics_rising:  extractTopics(topicsData, "rising"),
  };

  // ── Save to Supabase ───────────────────────────────────────────────────────
  const { data: saved, error } = await supabase
    .from("trends")
    .insert(trendsData)
    .select()
    .single();

  if (error) {
    // Still return the data even if Supabase save fails
    console.error("Supabase insert error:", error.message);
    return NextResponse.json({ data: trendsData, cached: false });
  }

  return NextResponse.json({ data: saved, cached: false });
}
