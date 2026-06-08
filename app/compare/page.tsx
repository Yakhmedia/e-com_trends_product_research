"use client";

import { useState } from "react";
import { X, Plus, Loader2, GitCompare, TrendingUp, TrendingDown, Minus, Bot } from "lucide-react";
import Navbar from "@/components/Navbar";
import CompareChart from "@/components/CompareChart";
import DateFilter from "@/components/DateFilter";
import AIAgent from "@/components/AIAgent";
import { TrendsData } from "@/lib/types";
import { useTheme } from "@/lib/theme";

const MAX = 5;

/** Per-theme dot / badge colors for keyword chips */
const CHIP_COLORS: Record<string, string[]> = {
  ops:       ["#0ea5e9","#10b981","#f59e0b","#f472b6","#8b5cf6"],
  executive: ["#c9a227","#e8c84a","#a07818","#f5d87a","#7a5a10"],
  stealth:   ["#00e5b0","#38bdf8","#c084fc","#fb923c","#4ade80"],
};

function getPeak(ds: TrendsData) {
  const vals = ds.interest_over_time.map((d) => d.value);
  return vals.length ? Math.max(...vals) : 0;
}
function getAvg(ds: TrendsData) {
  const vals = ds.interest_over_time.map((d) => d.value);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}
function getLatest(ds: TrendsData) {
  const vals = ds.interest_over_time;
  return vals.length ? vals[vals.length - 1].value : 0;
}
function getTrend(ds: TrendsData): "up" | "down" | "flat" {
  const vals = ds.interest_over_time.map((d) => d.value);
  if (vals.length < 5) return "flat";
  const recent = vals.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const old = vals.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  if (recent > old + 2) return "up";
  if (recent < old - 2) return "down";
  return "flat";
}

export default function ComparePage() {
  const { theme } = useTheme();
  const [input, setInput] = useState("");
  const [datasets, setDatasets] = useState<TrendsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("today 12-m");
  const [agentOpen, setAgentOpen] = useState(false);

  const palette = CHIP_COLORS[theme] ?? CHIP_COLORS.ops;

  const handleDateChange = (newDate: string) => {
    setDateRange(newDate);
    setDatasets([]);
  };

  const addKeyword = async () => {
    const kw = input.trim().toLowerCase();
    if (!kw) return;
    if (datasets.length >= MAX) { setError(`Maximum ${MAX} keywords`); return; }
    if (datasets.find((d) => d.keyword === kw)) { setError("Already added"); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trends?keyword=${encodeURIComponent(kw)}&date=${encodeURIComponent(dateRange)}`);
      const json = await res.json() as { data?: TrendsData; error?: string };
      if (!res.ok || json.error || !json.data) { setError(json.error ?? "Fetch failed"); return; }
      setDatasets((prev) => [...prev, json.data!]);
      setInput("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const remove = (kw: string) => setDatasets((prev) => prev.filter((d) => d.keyword !== kw));

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <Navbar onAgentOpen={() => setAgentOpen(true)} />

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-theme-text">Compare Keywords</h1>
          <p className="text-theme-muted text-sm mt-0.5">Add up to {MAX} keywords to compare side by side</p>
        </div>

        {/* Date filter */}
        <div className="bg-theme-surface border border-theme-border rounded-2xl p-4 theme-card">
          <DateFilter value={dateRange} onChange={handleDateChange} />
        </div>

        {/* Add keyword */}
        <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
          <div className="flex gap-3 flex-wrap">
            {datasets.map((ds, i) => (
              <div
                key={ds.keyword}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium"
                style={{
                  backgroundColor: `${palette[i % palette.length]}22`,
                  borderColor: `${palette[i % palette.length]}55`,
                  color: palette[i % palette.length],
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: palette[i % palette.length] }}
                />
                {ds.keyword}
                <button onClick={() => remove(ds.keyword)} className="hover:opacity-70 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {datasets.length < MAX && (
              <div className="flex gap-2 flex-1 min-w-48">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                  placeholder="Add a keyword..."
                  className="flex-1 bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
                />
                <button
                  onClick={addKeyword}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition flex items-center gap-1.5 theme-btn"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            )}
          </div>
          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        </div>

        {datasets.length === 0 ? (
          <div className="text-center py-24 text-theme-muted">
            <GitCompare className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Add at least 2 keywords to compare</p>
          </div>
        ) : (
          <>
            {/* Overlay chart */}
            {datasets.length >= 1 && <CompareChart datasets={datasets} />}

            {/* Stats comparison grid */}
            <div>
              <h2 className="text-theme-text font-semibold text-lg mb-4">Side-by-Side Metrics</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border">
                      <th className="text-left text-theme-muted font-medium py-3 pr-6">Metric</th>
                      {datasets.map((ds, i) => (
                        <th key={ds.keyword} className="text-left py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: palette[i % palette.length] }}
                            />
                            <span className="capitalize text-theme-text">{ds.keyword}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border">
                    {[
                      { label: "Peak Interest", fn: getPeak, suffix: "/100", highlight: "max" },
                      { label: "Average Interest", fn: getAvg, suffix: "/100", highlight: "max" },
                      { label: "Current Interest", fn: getLatest, suffix: "/100", highlight: "max" },
                      {
                        label: "Top Region",
                        fn: (ds: TrendsData) => ds.interest_by_region[0]?.location ?? "—",
                        suffix: "",
                        highlight: "none",
                      },
                      {
                        label: "Rising Queries",
                        fn: (ds: TrendsData) => ds.related_queries_rising.length,
                        suffix: "",
                        highlight: "max",
                      },
                    ].map(({ label, fn, suffix, highlight }) => {
                      const vals = datasets.map((ds) => fn(ds));
                      const numVals = vals.map((v) => Number(v));
                      const best = highlight === "max" ? Math.max(...numVals) : -1;

                      return (
                        <tr key={label}>
                          <td className="text-theme-muted py-3 pr-6 font-medium">{label}</td>
                          {datasets.map((ds, i) => {
                            const val = fn(ds);
                            const isBest = highlight === "max" && Number(val) === best && datasets.length > 1;
                            return (
                              <td key={ds.keyword} className="py-3 px-4">
                                <span className={`font-semibold ${isBest ? "text-green-400" : "text-theme-text"}`}>
                                  {String(val)}{suffix}
                                </span>
                                {isBest && <span className="ml-1.5 text-xs text-green-500">↑ best</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="text-theme-muted py-3 pr-6 font-medium">Momentum</td>
                      {datasets.map((ds) => {
                        const t = getTrend(ds);
                        return (
                          <td key={ds.keyword} className="py-3 px-4">
                            {t === "up"   && <span className="flex items-center gap-1 text-green-400 font-medium"><TrendingUp className="w-4 h-4" /> Rising</span>}
                            {t === "down" && <span className="flex items-center gap-1 text-red-400 font-medium"><TrendingDown className="w-4 h-4" /> Declining</span>}
                            {t === "flat" && <span className="flex items-center gap-1 text-theme-muted font-medium"><Minus className="w-4 h-4" /> Stable</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top regions per keyword */}
            <div>
              <h2 className="text-theme-text font-semibold text-lg mb-4">Top Regions</h2>
              <div className={`grid gap-5 grid-cols-1 ${datasets.length >= 2 ? "sm:grid-cols-2" : ""} ${datasets.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                {datasets.map((ds, i) => (
                  <div key={ds.keyword} className="bg-theme-surface border border-theme-border rounded-2xl p-4 theme-card">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
                      <span className="capitalize text-theme-text font-medium text-sm">{ds.keyword}</span>
                    </div>
                    <div className="space-y-2">
                      {ds.interest_by_region.slice(0, 5).map((r, ri) => (
                        <div key={r.location} className="flex items-center gap-3">
                          <span className="text-xs text-theme-muted w-4">{ri + 1}</span>
                          <div className="flex-1 h-1.5 bg-theme-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${r.value}%`, backgroundColor: palette[i % palette.length] }}
                            />
                          </div>
                          <span className="text-xs text-theme-text w-24 truncate">{r.location}</span>
                          <span className="text-xs text-theme-muted w-8 text-right">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rising queries per keyword */}
            <div>
              <h2 className="text-theme-text font-semibold text-lg mb-4">Rising Queries</h2>
              <div className={`grid gap-5 grid-cols-1 ${datasets.length >= 2 ? "sm:grid-cols-2" : ""} ${datasets.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                {datasets.map((ds, i) => (
                  <div key={ds.keyword} className="bg-theme-surface border border-theme-border rounded-2xl p-4 theme-card">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
                      <span className="capitalize text-theme-text font-medium text-sm">{ds.keyword}</span>
                    </div>
                    {ds.related_queries_rising.length === 0 ? (
                      <p className="text-theme-muted text-xs">No rising queries</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ds.related_queries_rising.slice(0, 5).map((q, qi) => (
                          <div key={qi} className="flex items-center justify-between text-xs">
                            <span className="text-theme-text">{q.query}</span>
                            <span className="text-green-400 font-medium">+{q.value}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* AI Analyst pull tab */}
      {!agentOpen && (
        <button
          onClick={() => setAgentOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-theme-accent hover:bg-theme-accent-hover text-white rounded-l-xl px-2 py-5 shadow-xl transition theme-btn"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      <AIAgent
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        trendsData={datasets[0]}
      />
    </div>
  );
}
