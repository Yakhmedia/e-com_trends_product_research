export interface TimelineDataPoint {
  date: string;
  value: number;
}

export interface RegionData {
  location: string;
  value: number;
}

export interface RelatedQuery {
  query: string;
  value: string;
  link?: string;
}

// SerpAPI `date` param values — kept here so API + UI stay in sync
export const DATE_PRESETS = [
  { label: "7 days",    value: "now 7-d",     description: "Hourly data, last 7 days" },
  { label: "30 days",   value: "today 1-m",   description: "Daily data, last 30 days" },
  { label: "90 days",   value: "today 3-m",   description: "Weekly data, last 90 days" },
  { label: "12 months", value: "today 12-m",  description: "Weekly data, last 12 months" },
  { label: "5 years",   value: "today 5-y",   description: "Monthly data, last 5 years" },
  { label: "All time",  value: "all",          description: "Monthly data, 2004 – present" },
] as const;

export type DatePresetValue = typeof DATE_PRESETS[number]["value"];

export interface TrendsData {
  id?: string;
  keyword: string;
  date_range: string;   // SerpAPI date param e.g. "today 12-m" or "2024-01-01 2024-12-31"
  fetched_at?: string;
  interest_over_time: TimelineDataPoint[];
  interest_by_region: RegionData[];
  related_queries_top: RelatedQuery[];
  related_queries_rising: RelatedQuery[];
  related_topics_top: RelatedQuery[];
  related_topics_rising: RelatedQuery[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
