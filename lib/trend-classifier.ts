import { TimelineDataPoint } from "./types";

export type TrendType =
  | "Evergreen"    // Consistent, sells all year — high avg, low variance
  | "Seasonal"     // Clear concentrated spikes — high peak-to-avg ratio
  | "Trending Up"  // Rising trajectory over the period
  | "Declining"    // Falling trajectory
  | "Niche"        // Low but stable
  | "Volatile";    // Unpredictable swings

export interface TrendClassification {
  type: TrendType;
  confidence: number;     // 0–100
  description: string;
  colorClass: string;     // Tailwind text color
  bgClass: string;        // Tailwind bg color
  emoji: string;
}

// ── Linear regression slope (returns units per period) ─────────────────────
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((sum, x, i) => sum + (x - xMean) * (values[i] - yMean), 0);
  const den = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

// ── Std deviation ──────────────────────────────────────────────────────────
function stdDev(values: number[], mean: number): number {
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// ── Seasonality: detect if high-value weeks are clustered (seasonal) ───────
// Returns 0 (uniform) → 1 (perfectly clustered in one block)
function seasonalityScore(values: number[], mean: number): number {
  const threshold = mean * 1.6;
  const spikeWeeks = values.map((v, i) => (v >= threshold ? i : -1)).filter((i) => i >= 0);
  if (spikeWeeks.length < 2) return spikeWeeks.length > 0 ? 0.9 : 0;
  const span = spikeWeeks[spikeWeeks.length - 1] - spikeWeeks[0];
  const maxSpan = values.length - 1;
  // Clustered = small span relative to total
  return 1 - span / maxSpan;
}

export function classifyTrend(data: TimelineDataPoint[]): TrendClassification {
  if (!data.length) {
    return {
      type: "Volatile", confidence: 0,
      description: "Not enough data to classify.",
      colorClass: "text-gray-400", bgClass: "bg-gray-500/15", emoji: "❓",
    };
  }

  const values = data.map((d) => d.value);
  const mean   = values.reduce((a, b) => a + b, 0) / values.length;
  const sd     = stdDev(values, mean);
  const max    = Math.max(...values);
  const min    = Math.min(...values);
  const s      = slope(values);                   // change per week/month
  const seasonal = seasonalityScore(values, mean);
  const peakRatio = mean > 0 ? max / mean : 1;    // how spiky relative to avg

  // Normalize slope to a "per-period" rate independent of data length
  // (approx % change across the full period)
  const totalChange = s * values.length;

  // ── Decision tree ────────────────────────────────────────────────────────

  // 1. Seasonal: concentrated high spikes, peak >> avg
  if (seasonal > 0.55 && peakRatio > 2.5) {
    const conf = Math.round(Math.min(100, seasonal * 80 + peakRatio * 5));
    return {
      type: "Seasonal", confidence: conf,
      description: `Interest spikes sharply in a concentrated window — a seasonal product. Plan inventory and ads around the peak period.`,
      colorClass: "text-orange-400", bgClass: "bg-orange-500/15", emoji: "🎄",
    };
  }

  // 2. Trending Up: sustained positive slope, not already at 100
  if (totalChange > 15 && mean < 90 && sd < 25) {
    const conf = Math.round(Math.min(100, (totalChange / 40) * 100));
    return {
      type: "Trending Up", confidence: conf,
      description: `Interest is climbing steadily. Early-mover advantage is strong — source and list now before competition increases.`,
      colorClass: "text-green-400", bgClass: "bg-green-500/15", emoji: "🚀",
    };
  }

  // 3. Declining
  if (totalChange < -15 && mean > 10) {
    const conf = Math.round(Math.min(100, (Math.abs(totalChange) / 40) * 100));
    return {
      type: "Declining", confidence: conf,
      description: `Interest is steadily falling. Consider discounting current stock or pivoting to adjacent rising categories.`,
      colorClass: "text-red-400", bgClass: "bg-red-500/15", emoji: "📉",
    };
  }

  // 4. Evergreen: high average, low variance
  if (mean >= 35 && sd < 18) {
    const conf = Math.round(Math.min(100, (mean / 100) * 60 + (1 - sd / 30) * 40));
    return {
      type: "Evergreen", confidence: conf,
      description: `Consistently strong interest year-round — a reliable product with stable demand. Good for long-term listings.`,
      colorClass: "text-emerald-400", bgClass: "bg-emerald-500/15", emoji: "🌿",
    };
  }

  // 5. Niche: low but stable
  if (mean < 25 && sd < 12) {
    const conf = Math.round(Math.min(100, (1 - mean / 30) * 70 + (1 - sd / 15) * 30));
    return {
      type: "Niche", confidence: conf,
      description: `Low but consistent interest — a niche product with a dedicated audience. Lower competition, loyal buyers.`,
      colorClass: "text-blue-400", bgClass: "bg-blue-500/15", emoji: "🎯",
    };
  }

  // 6. Volatile
  const conf = Math.round(Math.min(100, (sd / 30) * 80));
  return {
    type: "Volatile", confidence: conf,
    description: `Interest fluctuates unpredictably. Requires careful stock management — monitor weekly before committing inventory.`,
    colorClass: "text-yellow-400", bgClass: "bg-yellow-500/15", emoji: "⚡",
  };
}
