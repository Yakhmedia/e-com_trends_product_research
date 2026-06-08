"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-2xl mb-5">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-theme-text mb-2">Something went wrong</h1>
        <p className="text-theme-muted text-sm mb-6">
          An unexpected error occurred. It has been reported automatically.
        </p>
        {error?.digest && (
          <p className="text-xs text-theme-muted font-mono bg-theme-elevated border border-theme-border rounded-lg px-3 py-2 mb-6">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-theme-accent hover:bg-theme-accent-hover text-white rounded-xl font-medium text-sm transition theme-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
