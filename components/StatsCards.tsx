"use client";

import { TrendingUp, TrendingDown, MapPin, BarChart2, Activity } from "lucide-react";
import { TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";
import TrendBadge from "@/components/TrendBadge";

interface StatsCardsProps {
  data: TrendsData;
}

export default function StatsCards({ data }: StatsCardsProps) {
  const values = data.interest_over_time.map((d) => d.value);
  const peak   = Math.max(...values);
  const avg    = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const latest = values[values.length - 1] ?? 0;
  const prev   = values[values.length - 5] ?? latest;
  const trend  = latest >= prev ? "up" : "down";
  const topRegion  = data.interest_by_region[0]?.location ?? "N/A";
  const risingCount = data.related_queries_rising.length;
  const classification = classifyTrend(data.interest_over_time);

  const cards = [
    {
      label: "Peak Interest",
      value: `${peak}/100`,
      icon: BarChart2,
      color: "text-theme-accent",
      bg: "bg-theme-accent-soft",
    },
    {
      label: "Avg Interest",
      value: `${avg}/100`,
      icon: Activity,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Current Trend",
      value: trend === "up" ? "Rising" : "Declining",
      icon: trend === "up" ? TrendingUp : TrendingDown,
      color: trend === "up" ? "text-green-400" : "text-red-400",
      bg: trend === "up" ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      label: "Top Region",
      value: topRegion,
      icon: MapPin,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Rising Queries",
      value: `${risingCount} found`,
      icon: TrendingUp,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Trend classification banner */}
      <div className="bg-theme-surface border border-theme-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <TrendBadge classification={classification} showConfidence />
          <span className="text-theme-muted text-sm hidden sm:inline">·</span>
          <p className="text-sm text-theme-muted leading-snug">{classification.description}</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`${card.bg} bg-theme-surface rounded-xl p-4 border border-theme-border theme-card`}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-theme-muted">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
