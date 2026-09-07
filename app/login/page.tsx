"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { BarChart2, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";

// Only same-origin paths may be redirect targets. A raw `redirectTo` would
// let /login?redirectTo=https://evil.com send the user off-site the moment
// they sign in. "//evil.com" is protocol-relative and just as external.
function safeRedirect(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/dashboard";
  return path;
}

// Supabase surfaces raw API strings; map the ones users actually hit.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Confirm your email address before signing in — check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a few minutes and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Could not reach the server. Check your connection and try again.";
  return message;
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = safeRedirect(searchParams.get("redirectTo"));
  const errorParam   = searchParams.get("error");
  const justReset    = searchParams.get("reset") === "success";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(
    errorParam === "unauthorized"
      ? "Your account doesn't have access yet. Contact your administrator."
      : errorParam === "profile_lookup_failed"
        ? "We could not verify your permissions — the account lookup failed. Try again in a moment; if it persists, contact your administrator."
        : null
  );
  // Until the session check resolves, render nothing but the spinner —
  // otherwise a signed-in user sees the whole form flash before redirecting.
  const [checkingSession, setCheckingSession] = useState(true);

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (user) {
        router.replace(redirectTo);
        router.refresh();
      } else {
        setCheckingSession(false);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError || !data.user) {
      setError(friendlyAuthError(authError?.message ?? "Login failed"));
      setLoading(false);
      return;
    }

    // The profile row is created by the on_auth_user_created trigger
    // (migration 006) with role 'viewer'. Clients never insert or upsert it —
    // the INSERT policy is gone, so an upsert here would only ever fail.

    router.replace(redirectTo);
    // Server components hold a cached, signed-out session until told otherwise.
    router.refresh();
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-theme-bg flex items-center justify-center" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin text-theme-muted" aria-label="Loading" />
      </div>
    );
  }

  const inputClass =
    "w-full bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition";

  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-theme-accent rounded-2xl mb-4">
            <BarChart2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-theme-text">Product Trends</h1>
          <p className="text-theme-muted text-sm mt-1">Invite-only access</p>
        </div>

        <div className="bg-theme-surface border border-theme-border rounded-2xl p-8 shadow-[var(--t-shadow)] theme-card">
          <h2 className="text-lg font-semibold text-theme-text mb-6">Sign in to your account</h2>

          {justReset && !error && (
            <div
              role="status"
              className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 mb-5 text-sm"
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Password updated. Sign in with your new password.
            </div>
          )}

          {error && (
            <div
              id="login-error"
              role="alert"
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
                aria-describedby={error ? "login-error" : undefined}
                placeholder="admin@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="text-sm text-theme-muted block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  placeholder="••••••••"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-text transition p-1 rounded focus:outline-none focus:ring-2 focus:ring-theme-accent"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full mt-2 py-3 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 theme-btn"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign in"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-theme-muted hover:text-theme-text transition focus:outline-none focus:ring-2 focus:ring-theme-accent rounded"
            >
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
