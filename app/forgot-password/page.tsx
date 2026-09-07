"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { BarChart2, Loader2, AlertCircle, MailCheck, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/update-password` }
    );

    // Deliberately do NOT branch the UI on whether the address exists —
    // a different response for known vs unknown emails is an account
    // enumeration oracle. Only surface genuine transport/rate-limit failures.
    if (resetError && !/user not found|unable to validate email/i.test(resetError.message)) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-theme-accent rounded-2xl mb-4">
            <BarChart2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-theme-text">Product Trends</h1>
          <p className="text-theme-muted text-sm mt-1">Reset your password</p>
        </div>

        <div className="bg-theme-surface border border-theme-border rounded-2xl p-8 shadow-[var(--t-shadow)] theme-card">
          {sent ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-theme-accent-soft mb-4">
                <MailCheck className="w-6 h-6 text-theme-accent" />
              </div>
              <h2 className="text-lg font-semibold text-theme-text mb-2">Check your inbox</h2>
              <p className="text-sm text-theme-muted">
                If an account exists for <span className="text-theme-text">{email.trim().toLowerCase()}</span>,
                we&rsquo;ve sent a link to reset your password. The link expires shortly — request another if it lapses.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-theme-text mb-2">Forgot your password?</h2>
              <p className="text-sm text-theme-muted mb-6">
                Enter your email and we&rsquo;ll send you a link to set a new one.
              </p>

              {error && (
                <div
                  id="reset-error"
                  role="alert"
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="text-sm text-theme-muted block mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "reset-error" : undefined}
                    placeholder="admin@example.com"
                    className="w-full bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="w-full mt-2 py-3 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 theme-btn"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : "Send reset link"}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-theme-muted hover:text-theme-text transition focus:outline-none focus:ring-2 focus:ring-theme-accent rounded"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
