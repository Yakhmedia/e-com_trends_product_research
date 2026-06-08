"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onSearch(input.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 w-full max-w-2xl">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted w-5 h-5" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search a product keyword (e.g. wireless earbuds)"
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-theme-border bg-theme-surface text-theme-text placeholder-[color:var(--t-muted)] focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="px-6 py-3 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center gap-2 theme-btn"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {loading ? "Fetching..." : "Search"}
      </button>
    </form>
  );
}
