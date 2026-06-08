"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { RegionData } from "@/lib/types";
import { useTheme } from "@/lib/theme";

interface RegionChartProps { data: RegionData[] }

const PALETTE = ["#6366f1","#8b5cf6","#a78bfa","#818cf8","#60a5fa","#34d399","#fbbf24","#f87171","#fb923c","#e879f9"];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: RegionData }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-theme-elevated border border-theme-border rounded-lg p-3 text-sm shadow-xl">
      <p className="text-theme-text font-medium">{payload[0].payload.location}</p>
      <p className="text-theme-accent font-bold">{payload[0].value}/100</p>
    </div>
  );
}

export default function RegionChart({ data }: RegionChartProps) {
  const { mode } = useTheme();
  const top = data.slice(0, 10);
  const gridColor = mode === "light" ? "#d1d5db" : "#1e3a55";
  const axisColor = mode === "light" ? "#6b7280" : "#5a90b8";

  return (
    <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
      <h2 className="text-theme-text font-semibold text-lg mb-4">Interest by Region</h2>
      {!top.length ? (
        <div className="h-[260px] flex items-center justify-center text-theme-muted text-sm">No regional data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={top} margin={{ top: 5, right: 10, left: -20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="location" tick={{ fill: axisColor, fontSize: 10 }} tickLine={false} angle={-35} textAnchor="end" />
            <YAxis domain={[0, 100]} tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {top.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
