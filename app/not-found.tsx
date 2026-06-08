import Link from "next/link";
import { SearchX, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-theme-accent-soft border border-theme-border-accent rounded-2xl mb-5">
          <SearchX className="w-7 h-7 text-theme-accent" />
        </div>
        <h1 className="text-5xl font-bold text-theme-text mb-2">404</h1>
        <p className="text-theme-muted text-sm mb-6">
          This page doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-theme-accent hover:bg-theme-accent-hover text-white rounded-xl font-medium text-sm transition theme-btn"
        >
          <LayoutDashboard className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
