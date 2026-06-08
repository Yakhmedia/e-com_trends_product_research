"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { TrendsData } from "@/lib/types";
import { useTheme } from "@/lib/theme";

interface CompareChartProps {
  datasets: TrendsData[];
}

/** Per-theme ordered line color palettes (5 lines each) */
const PALETTES: Record<string, Record<string, string[]>> = {
  ops: {
    dark:  ["#0ea5e9", "#10b981", "#f59e0b", "#f472b6", "#8b5cf6"],
    light: ["#0369a1", "#059669", "#d97706", "#db2777", "#7c3aed"],
  },
  executive: {
    // Five distinct gold / amber nuances — clearly different from each other
    dark:  ["#c9a227", "#e8c84a", "#a07818", "#f5d87a", "#7a5a10"],
    light: ["#9a7a1a", "#c9a227", "#7a5f10", "#b8860b", "#e8c84a"],
  },
  stealth: {
    dark:  ["#00e5b0", "#38bdf8", "#c084fc", "#fb923c", "#4ade80"],
    light: ["#00897b", "#0284c7", "#9333ea", "#ea580c", "#16a34a"],
  },
};

function buildMerged(datasets: TrendsData[]) {
  if (!datasets.length) return [];
  const dates = datasets[0].interest_over_time.map((d) => d.date);
  return dates.map((date, i) => {
    const point: Record<string, string | number> = { date };
    datasets.forEach((ds) => {
      point[ds.keyword] = ds.interest_over_time[i]?.value ?? 0;
    });
    return point;
  });
}

export default function CompareChart({ datasets }: CompareChartProps) {
  const { theme, mode } = useTheme();
  const merged = buildMerged(datasets);
  const palette = PALETTES[theme]?.[mode] ?? PALETTES.ops.dark;

  return (
    <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
      <h2 className="text-theme-text font-semibold text-lg mb-4">Interest Over Time — Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={merged} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--t-muted)", fontSize: 10 }}
            tickLine={false}
            interval={Math.floor(merged.length / 6)}
          />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--t-muted)", fontSize: 11 }} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--t-elevated)",
              border: "1px solid var(--t-border)",
              borderRadius: 8,
            }}
            labelStyle={{ color: "var(--t-muted)", fontSize: 11 }}
            itemStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {datasets.map((ds, i) => (
            <Line
              key={ds.keyword}
              type="monotone"
              dataKey={ds.keyword}
              stroke={palette[i % palette.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
