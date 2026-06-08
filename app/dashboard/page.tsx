"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Database, Bot } from "lucide-react";
import Navbar from "@/components/Navbar";
import SearchBar from "@/components/SearchBar";
import DateFilter from "@/components/DateFilter";
import StatsCards from "@/components/StatsCards";
import TrendChart from "@/components/TrendChart";
import RegionChart from "@/components/RegionChart";
import RelatedQueries from "@/components/RelatedQueries";
import AIAgent from "@/components/AIAgent";
import { TrendsData } from "@/lib/types";

function DashboardInner() {
  const searchParams = useSearchParams();
  const [loading, setLoading]       = useState(false);
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [agentOpen, setAgentOpen]   = useState(false);
  const [cached, setCached]         = useState(false);
  const [dateRange, setDateRange]   = useState("today 12-m");
  const [lastKeyword, setLastKeyword] = useState<string | null>(null);

  useEffect(() => {
    const kw = searchParams.get("keyword");
    if (kw) handleSearch(kw, dateRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastKeyword) handleSearch(lastKeyword, dateRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const handleSearch = async (keyword: string, date = dateRange) => {
    setLoading(true);
    setError(null);
    setLastKeyword(keyword);
    try {
      const res  = await fetch(`/api/trends?keyword=${encodeURIComponent(keyword)}&date=${encodeURIComponent(date)}`);
      const json = await res.json() as { data?: TrendsData; error?: string; cached?: boolean };
      if (!res.ok || json.error) { setError(json.error ?? "Failed to fetch trends"); return; }
      setTrendsData(json.data ?? null);
      setCached(json.cached ?? false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <Navbar onAgentOpen={() => setAgentOpen(true)} />

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Search + date filter */}
        <div className="flex flex-col items-center gap-4 w-full">
          <SearchBar onSearch={(kw) => handleSearch(kw, dateRange)} loading={loading} />
          <div className="w-full max-w-3xl">
            <DateFilter value={dateRange} onChange={setDateRange} />
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        {!trendsData && !loading && (
          <div className="text-center py-24 text-theme-muted">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Search a product keyword to load trend data</p>
            <p className="text-sm mt-1 opacity-60">Results are cached for 6 hours · Powered by SerpAPI + Google Trends</p>
          </div>
        )}

        {trendsData && (
          <>
            {/* Meta */}
            <div className="flex items-center flex-wrap gap-2 text-xs text-theme-muted">
              <span className="capitalize font-semibold text-theme-text text-base">&ldquo;{trendsData.keyword}&rdquo;</span>
              <span className="flex items-center gap-1 bg-theme-accent-soft border border-theme-border-accent text-theme-accent px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" /> {trendsData.date_range}
              </span>
              {cached && (
                <span className="flex items-center gap-1 bg-theme-elevated px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> Cached
                </span>
              )}
              {trendsData.fetched_at && (
                <span className="bg-theme-elevated px-2 py-1 rounded-full">
                  {new Date(trendsData.fetched_at).toLocaleString()}
                </span>
              )}
            </div>

            <StatsCards data={trendsData} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrendChart data={trendsData.interest_over_time} keyword={trendsData.keyword} />
              <RegionChart data={trendsData.interest_by_region} />
            </div>

            <RelatedQueries
              topQueries={trendsData.related_queries_top}
              risingQueries={trendsData.related_queries_rising}
              topTopics={trendsData.related_topics_top}
              risingTopics={trendsData.related_topics_rising}
            />
          </>
        )}
      </main>

      {!agentOpen && (
        <button
          onClick={() => setAgentOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-theme-accent hover:bg-theme-accent-hover text-white rounded-l-xl px-2 py-5 shadow-xl transition"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      <AIAgent open={agentOpen} onClose={() => setAgentOpen(false)} trendsData={trendsData ?? undefined} />
    </div>
  );
}

export default function Dashboard() {
  return <Suspense><DashboardInner /></Suspense>;
}
