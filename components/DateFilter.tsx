"use client";

import { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { DATE_PRESETS } from "@/lib/types";

interface DateFilterProps {
  value: string;
  onChange: (dateParam: string) => void;
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate]     = useState("");

  const isCustom     = !DATE_PRESETS.some((p) => p.value === value);
  const activePreset = DATE_PRESETS.find((p) => p.value === value);

  const applyCustom = () => {
    if (!fromDate || !toDate || fromDate >= toDate) return;
    onChange(`${fromDate} ${toDate}`);
    setCustomOpen(false);
  };

  const clearCustom = () => {
    onChange("today 12-m");
    setFromDate(""); setToDate("");
    setCustomOpen(false);
  };

  const maxDate = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-theme-muted flex items-center gap-1.5 mr-1">
          <Calendar className="w-3.5 h-3.5" /> Period:
        </span>

        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => { onChange(preset.value); setCustomOpen(false); }}
            title={preset.description}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border theme-btn ${
              value === preset.value
                ? "bg-theme-accent border-theme-border-accent text-white"
                : "bg-theme-elevated border-theme-border text-theme-muted hover:border-theme-border-accent hover:text-theme-text"
            }`}
          >
            {preset.label}
          </button>
        ))}

        <button
          onClick={() => setCustomOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border theme-btn ${
            isCustom || customOpen
              ? "bg-theme-accent border-theme-border-accent text-white"
              : "bg-theme-elevated border-theme-border text-theme-muted hover:text-theme-text"
          }`}
        >
          Custom range
          <ChevronDown className={`w-3 h-3 transition-transform ${customOpen ? "rotate-180" : ""}`} />
        </button>

        {activePreset && (
          <span className="ml-auto text-xs text-theme-muted italic">{activePreset.description}</span>
        )}
        {isCustom && !customOpen && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-theme-accent bg-theme-accent-soft border border-theme-border-accent px-2 py-0.5 rounded-lg">{value}</span>
            <button onClick={clearCustom} className="text-theme-muted hover:text-red-400 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-end gap-3 bg-theme-elevated border border-theme-border rounded-xl px-4 py-3">
          <div>
            <label className="text-xs text-theme-muted block mb-1">From</label>
            <input type="date" value={fromDate} min="2004-01-01" max={toDate || maxDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-theme-surface border border-theme-border text-theme-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-theme-accent transition [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-xs text-theme-muted block mb-1">To</label>
            <input type="date" value={toDate} min={fromDate || "2004-01-01"} max={maxDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-theme-surface border border-theme-border text-theme-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-theme-accent transition [color-scheme:dark]"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={applyCustom} disabled={!fromDate || !toDate || fromDate >= toDate}
              className="px-4 py-2 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-40 text-white text-sm font-medium rounded-lg transition theme-btn">
              Apply
            </button>
            <button onClick={() => setCustomOpen(false)}
              className="px-3 py-2 bg-theme-surface hover:bg-theme-elevated text-theme-muted text-sm rounded-lg border border-theme-border transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
