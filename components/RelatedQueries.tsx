"use client";

import { useState } from "react";
import { TrendingUp, Flame } from "lucide-react";
import { RelatedQuery } from "@/lib/types";

interface RelatedQueriesProps {
  topQueries: RelatedQuery[];
  risingQueries: RelatedQuery[];
  topTopics: RelatedQuery[];
  risingTopics: RelatedQuery[];
}

type Tab = "top-queries" | "rising-queries" | "top-topics" | "rising-topics";

function formatRisingValue(val: string): string {
  if (!val) return "";
  if (val === "Breakout") return "🔥 Breakout";
  if (val.startsWith("+") || val.includes("%")) return val;
  const n = Number(val);
  if (!isNaN(n)) return `+${n}%`;
  return val;
}

export default function RelatedQueries({ topQueries, risingQueries, topTopics, risingTopics }: RelatedQueriesProps) {
  const [tab, setTab] = useState<Tab>("top-queries");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "top-queries",    label: "Top Queries",    icon: <TrendingUp className="w-3 h-3" /> },
    { id: "rising-queries", label: "Rising Queries", icon: <Flame className="w-3 h-3" /> },
    { id: "top-topics",     label: "Top Topics",     icon: <TrendingUp className="w-3 h-3" /> },
    { id: "rising-topics",  label: "Rising Topics",  icon: <Flame className="w-3 h-3" /> },
  ];

  const dataMap: Record<Tab, RelatedQuery[]> = {
    "top-queries":    topQueries,
    "rising-queries": risingQueries,
    "top-topics":     topTopics,
    "rising-topics":  risingTopics,
  };

  const current = dataMap[tab];
  const isRising = tab.includes("rising");

  return (
    <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
      <h2 className="text-theme-text font-semibold text-lg mb-4">Related Searches</h2>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition theme-btn ${
              tab === t.id
                ? "bg-theme-accent text-white"
                : "bg-theme-elevated text-theme-muted hover:text-theme-text"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <p className="text-theme-muted text-sm text-center py-6">No data available</p>
      ) : (
        <div className="space-y-0">
          {current.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-theme-border last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xs text-theme-muted w-5">{i + 1}</span>
                <span className="text-sm text-theme-text">{item.query}</span>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                isRising
                  ? "bg-green-500/15 text-green-400"
                  : "bg-theme-accent-soft text-theme-accent"
              }`}>
                {isRising ? formatRisingValue(item.value) : item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
