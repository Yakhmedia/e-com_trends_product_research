import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, createSupabaseServerClient } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { TrendsData, TimelineDataPoint, RegionData, RelatedQuery } from "@/lib/types";

const SERP_API_KEY = process.env.SERP_API_KEY!;

// ── Rate limiting (in-memory — acceptable for single-instance / low traffic) ─
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;          // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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

// ── Input validation ─────────────────────────────────────────────────────────
const ALLOWED_DATE_PATTERNS = [
  /^today \d+-[mhd]$/,
  /^now \d+-[Hd]$/,
  /^\d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2}$/,
];

function validateKeyword(kw: string): string | null {
  if (!kw || kw.length > 100) return "Keyword must be 1–100 characters";
  if (!/^[\w\s\-'.&]+$/u.test(kw)) return "Keyword contains invalid characters";
  return null;
}

function validateDate(date: string): string | null {
  if (ALLOWED_DATE_PATTERNS.some((p) => p.test(date))) return null;
  return "Invalid date range format";
}

// ── SerpAPI helpers ──────────────────────────────────────────────────────────
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

function extractRegions(data: Record<string, unknown>): RegionData[] {
  const raw = data?.interest_by_region;
  const regions = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
  if (!regions.length) return [];
  return regions
    .map((r) => ({
      location: r.location as string,
      value: (r.extracted_value as number) ?? (r.value as number) ?? 0,
    }))
    .filter((r) => r.location && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

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

function extractTopics(data: Record<string, unknown>, type: "top" | "rising"): RelatedQuery[] {
  const rt = data?.related_topics as Record<string, unknown> | undefined;
  const rows = rt?.[type] as Record<string, unknown>[] | undefined;
  if (!rows?.length) return [];
  return rows.slice(0, 10).map((t) => {
    const topic = t.topic as Record<string, string> | undefined;
    const displayValue = String(t.value ?? t.extracted_value ?? "");
    return {
      query: topic?.title ?? (t.query as string) ?? "",
      value: displayValue,
      link: t.link as string | undefined,
    };
  });
}

export async function GET(req: NextRequest) {
  // ── Auth guard (defense-in-depth after middleware) ─────────────────────────
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 30 searches per hour." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const keyword  = req.nextUrl.searchParams.get("keyword");
  const dateParam = req.nextUrl.searchParams.get("date") ?? "today 12-m";

  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const kw = keyword.toLowerCase().trim();
  const kwError = validateKeyword(kw);
  if (kwError) return NextResponse.json({ error: kwError }, { status: 400 });

  const dateError = validateDate(dateParam);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

  // ── Cache check — use admin client to bypass RLS for reads ─────────────────
  const adminClient = getSupabaseAdminClient();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: cached } = await adminClient
    .from("trends")
    .select("*")
    .eq("keyword", kw)
    .eq("date_range", dateParam)
    .gte("fetched_at", sixHoursAgo)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (cached) return NextResponse.json({ data: cached, cached: true });

  // ── Parallel SerpAPI calls ─────────────────────────────────────────────────
  const [timelineData, geoData, queriesData, topicsData] = await Promise.all([
    safeFetch(serpUrl(kw, "TIMESERIES",      dateParam)),
    safeFetch(serpUrl(kw, "GEO_MAP_0",       dateParam)),
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

  // ── Save to Supabase via admin client ──────────────────────────────────────
  const { data: saved, error } = await adminClient
    .from("trends")
    .insert(trendsData)
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error.message);
    return NextResponse.json({ data: trendsData, cached: false });
  }

  return NextResponse.json({ data: saved, cached: false });
}
