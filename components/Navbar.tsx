"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart2, History, GitCompare, LogOut, Bot } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import ThemeToggle from "@/components/ThemeToggle";

interface NavbarProps {
  onAgentOpen?: () => void;
}

const links = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/history",   label: "History",   icon: History   },
  { href: "/compare",   label: "Compare",   icon: GitCompare },
];

export default function Navbar({ onAgentOpen }: NavbarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createSupabaseBrowserClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="border-b border-theme-border bg-theme-surface/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo + nav links */}
        <div className="flex items-center gap-1">
          <div className="w-7 h-7 bg-theme-accent rounded-lg flex items-center justify-center mr-3">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition theme-btn ${
                pathname === href
                  ? "bg-theme-accent text-white"
                  : "text-theme-muted hover:text-theme-text hover:bg-theme-elevated"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {onAgentOpen && (
            <button
              onClick={onAgentOpen}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-theme-muted hover:text-theme-text hover:bg-theme-elevated rounded-lg transition"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI Analyst</span>
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-theme-muted hover:text-red-400 hover:bg-theme-elevated rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
