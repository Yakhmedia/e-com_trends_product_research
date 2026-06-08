"use client";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { TimelineDataPoint } from "@/lib/types";
import { useTheme } from "@/lib/theme";

interface TrendChartProps {
  data: TimelineDataPoint[];
  keyword: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-theme-elevated border border-theme-border rounded-lg p-3 text-sm shadow-xl">
      <p className="text-theme-muted mb-1">{label}</p>
      <p className="text-theme-accent font-bold">{payload[0].value}/100</p>
    </div>
  );
}

export default function TrendChart({ data, keyword }: TrendChartProps) {
  const { accentHex, mode } = useTheme();
  const avg = data.length ? Math.round(data.reduce((a, b) => a + b.value, 0) / data.length) : 0;
  const displayed = data.slice(-52);
  const gridColor  = mode === "light" ? "#d1d5db" : "#1e3a55";
  const axisColor  = mode === "light" ? "#6b7280" : "#5a90b8";

  return (
    <div className="bg-theme-surface border border-theme-border rounded-2xl p-5 theme-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-theme-text font-semibold text-lg">Interest Over Time</h2>
        <span className="text-xs text-theme-muted bg-theme-elevated px-3 py-1 rounded-full capitalize">{keyword}</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={displayed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="date"
            tick={{ fill: axisColor, fontSize: 11 }}
            tickLine={false}
            interval={Math.floor(displayed.length / 6)}
          />
          <YAxis domain={[0, 100]} tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={avg}
            stroke={accentHex}
            strokeDasharray="4 4"
            label={{ value: `avg ${avg}`, fill: accentHex, fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accentHex}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: accentHex }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
