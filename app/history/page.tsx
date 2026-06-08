"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, TrendingUp, Trash2, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TrendsData } from "@/lib/types";

type HistoryRow = TrendsData & { id: string; fetched_at: string };

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setLoading(true);
    const { data } = await supabase
      .from("trends")
      .select("id, keyword, fetched_at, interest_over_time, interest_by_region, related_queries_rising")
      .order("fetched_at", { ascending: false })
      .limit(100);
    setRows((data as HistoryRow[]) ?? []);
    setLoading(false);
  }

  async function deleteRow(id: string) {
    await supabase.from("trends").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = rows.filter((r) => r.keyword.includes(search.toLowerCase()));

  const getPeak = (row: HistoryRow) => {
    const vals = (row.interest_over_time as { value: number }[]).map((d) => d.value);
    return vals.length ? Math.max(...vals) : 0;
  };

  const getLatest = (row: HistoryRow) => {
    const vals = (row.interest_over_time as { value: number }[]);
    return vals.length ? vals[vals.length - 1].value : 0;
  };

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-theme-text">Search History</h1>
            <p className="text-theme-muted text-sm mt-0.5">{rows.length} searches stored in Supabase</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter keywords..."
              className="pl-9 pr-4 py-2 bg-theme-surface border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition w-56"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-theme-surface rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-theme-muted">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">{search ? "No matching searches" : "No searches yet"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => {
              const peak = getPeak(row);
              const latest = getLatest(row);
              const topRegion = (row.interest_by_region as { location: string; value: number }[])[0];
              const risingCount = (row.related_queries_rising as unknown[]).length;

              return (
                <div
                  key={row.id}
                  className="group bg-theme-surface border border-theme-border hover:border-theme-border-accent rounded-2xl p-4 flex items-center gap-4 transition cursor-pointer"
                  onClick={() => router.push(`/dashboard?keyword=${encodeURIComponent(row.keyword)}`)}
                >
                  <div className="w-10 h-10 bg-theme-accent-soft rounded-xl flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-theme-accent" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-theme-text capitalize">{row.keyword}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-theme-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(row.fetched_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-theme-accent font-bold">{peak}/100</p>
                      <p className="text-theme-muted text-xs">Peak</p>
                    </div>
                    <div className="text-center">
                      <p className="text-blue-400 font-bold">{latest}/100</p>
                      <p className="text-theme-muted text-xs">Latest</p>
                    </div>
                    {topRegion && (
                      <div className="text-center">
                        <p className="text-yellow-400 font-bold text-xs">{topRegion.location}</p>
                        <p className="text-theme-muted text-xs">Top Region</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-green-400 font-bold">{risingCount}</p>
                      <p className="text-theme-muted text-xs">Rising</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }}
                      className="p-2 text-theme-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-theme-muted group-hover:text-theme-accent transition" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

