"use client";

import { useTheme, ThemeName } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const THEMES: { name: ThemeName; label: string; icon: string; desc: string }[] = [
  { name: "ops",       label: "Ops",       icon: "⚙️", desc: "Clean · Blue/Teal" },
  { name: "executive", label: "Executive", icon: "👑", desc: "Luxury · Gold"      },
  { name: "stealth",   label: "Stealth",   icon: "🖥️", desc: "Terminal · Mint"   },
];

export default function ThemeToggle() {
  const { theme, mode, setTheme, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="flex items-center gap-1">
      {/* Light / Dark toggle */}
      <button
        onClick={toggleMode}
        title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="p-2 rounded-lg text-theme-muted hover:text-theme-text hover:bg-theme-elevated transition"
      >
        {mode === "dark"
          ? <Sun className="w-4 h-4" />
          : <Moon className="w-4 h-4" />}
      </button>

      {/* Theme picker */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-theme-muted hover:text-theme-text hover:bg-theme-elevated border border-transparent hover:border-theme-border transition"
        >
          <span>{THEMES.find((t) => t.name === theme)?.icon}</span>
          <span className="hidden sm:inline capitalize">{theme}</span>
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-1.5 w-52 rounded-xl z-50 overflow-hidden"
            style={{
              backgroundColor: "var(--t-surface)",
              border: "1px solid var(--t-border)",
              boxShadow: "var(--t-shadow, 0 8px 32px rgba(0,0,0,0.4))",
            }}
          >
            <p className="text-xs px-3 pt-2.5 pb-1.5" style={{ color: "var(--t-muted)", borderBottom: "1px solid var(--t-border)" }}>Dashboard Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.name}
                onClick={() => { setTheme(t.name); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition"
                style={{
                  color: theme === t.name ? "var(--t-accent)" : "var(--t-text)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--t-elevated)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span className="text-base">{t.icon}</span>
                <div className="text-left">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs" style={{ color: "var(--t-muted)" }}>{t.desc}</div>
                </div>
                {theme === t.name && <span className="ml-auto" style={{ color: "var(--t-accent)" }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
