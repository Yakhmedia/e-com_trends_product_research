import { TrendClassification } from "@/lib/trend-classifier";

interface TrendBadgeProps {
  classification: TrendClassification;
  showConfidence?: boolean;
  size?: "sm" | "md";
}

export default function TrendBadge({ classification, showConfidence = true, size = "md" }: TrendBadgeProps) {
  const { type, confidence, emoji, colorClass, bgClass } = classification;
  const textSize = size === "sm" ? "text-xs" : "text-xs";
  const padding  = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <span className={`inline-flex items-center gap-1.5 ${padding} rounded-full font-medium ${textSize} ${bgClass} ${colorClass} border border-current/20`}>
      <span>{emoji}</span>
      <span>{type}</span>
      {showConfidence && (
        <span className="opacity-60 font-normal">{confidence}%</span>
      )}
    </span>
  );
}
