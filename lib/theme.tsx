"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeName = "ops" | "executive" | "stealth";
export type ThemeMode = "dark" | "light";

interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  setTheme: (t: ThemeName) => void;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  /** Hex value of the current accent — for recharts / canvas that can't use CSS vars */
  accentHex: string;
}

const ACCENT_HEX: Record<ThemeName, Record<ThemeMode, string>> = {
  ops:       { dark: "#0ea5e9", light: "#0369a1" },
  executive: { dark: "#c9a227", light: "#9a7a1a" },
  stealth:   { dark: "#00e5b0", light: "#00897b" },
};

const ThemeCtx = createContext<ThemeContextValue>({
  theme: "ops", mode: "dark",
  setTheme: () => {}, setMode: () => {}, toggleMode: () => {},
  accentHex: "#0ea5e9",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("ops");
  const [mode, setModeState] = useState<ThemeMode>("dark");

  // Restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pt-theme") as ThemeName | null;
    const savedMode = localStorage.getItem("pt-mode") as ThemeMode | null;
    if (saved) setThemeState(saved);
    if (savedMode) setModeState(savedMode);
  }, []);

  // Apply to <html> data attributes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem("pt-theme", theme);
    localStorage.setItem("pt-mode", mode);
  }, [theme, mode]);

  const setTheme = (t: ThemeName) => setThemeState(t);
  const setMode  = (m: ThemeMode) => setModeState(m);
  const toggleMode = () => setModeState((m) => (m === "dark" ? "light" : "dark"));

  return (
    <ThemeCtx.Provider value={{
      theme, mode, setTheme, setMode, toggleMode,
      accentHex: ACCENT_HEX[theme][mode],
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
