import { TrendsData } from "./types";

// Runtime guard for the client-supplied `trendsContext` on POST /api/agent.
// The body used to be cast (`as TrendsData`) and consumed unvalidated, so a
// `{}` or a partial object threw a TypeError (classifyTrend, Math.max spread)
// and produced an unhandled 500. A shape that does not pass here is treated
// as "no trend data loaded", never as an error.

function isTimelineArray(v: unknown): v is { date: string; value: number }[] {
  return (
    Array.isArray(v) &&
    v.every(
      (d) =>
        d != null &&
        typeof d === "object" &&
        typeof (d as { date?: unknown }).date === "string" &&
        typeof (d as { value?: unknown }).value === "number" &&
        Number.isFinite((d as { value: number }).value)
    )
  );
}

export function isTrendsData(v: unknown): v is TrendsData {
  if (v == null || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;

  if (typeof t.keyword !== "string" || !t.keyword.trim()) return false;
  if (typeof t.date_range !== "string") return false;
  if (!isTimelineArray(t.interest_over_time)) return false;

  // The remaining collections are sliced/mapped in the prompt template; they
  // must be arrays but their element shape is not load-bearing.
  for (const key of [
    "interest_by_region",
    "related_queries_top",
    "related_queries_rising",
    "related_topics_top",
    "related_topics_rising",
  ]) {
    if (!Array.isArray(t[key])) return false;
  }

  return true;
}
