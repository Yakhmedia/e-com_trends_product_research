"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { BarChart2, Loader2, AlertCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;

type LinkState = "checking" | "valid" | "invalid";

function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // The recovery link can land here in one of three shapes depending on the
  // project's flow: a PKCE `?code=`, an implicit `#access_token=`, or an
  // error in the fragment. Establish a session from whichever arrived.
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const url  = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const linkErrorDescription =
        hash.get("error_description") ?? url.searchParams.get("error_description");
      if (linkErrorDescription) {
        if (!cancelled) {
          setLinkError(linkErrorDescription.replace(/\+/g, " "));
          setLinkState("invalid");
        }
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setLinkError(exchangeError.message);
          setLinkState("invalid");
          return;
        }
      }

      // detectSessionInUrl consumes an implicit-flow fragment on client
      // construction, so by this point a session should exist either way.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkState(session ? "valid" : "invalid");
    };

    resolve();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // End the recovery session so the new password is actually exercised.
    await supabase.auth.signOut();
    router.replace("/login?reset=success");
    router.refresh();
  };

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
          <p className="text-theme-muted text-sm mt-1">Choose a new password</p>
        </div>

        <div className="bg-theme-surface border border-theme-border rounded-2xl p-8 shadow-[var(--t-shadow)] theme-card">
          {linkState === "checking" && (
            <div className="flex items-center justify-center gap-2 py-6 text-theme-muted text-sm" aria-busy="true">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying your link…
            </div>
          )}

          {linkState === "invalid" && (
            <div>
              <div
                role="alert"
                className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  This reset link is invalid or has expired.
                  {linkError ? ` (${linkError})` : ""}
                </span>
              </div>
              <Link
                href="/forgot-password"
                className="block w-full text-center py-3 bg-theme-accent hover:bg-theme-accent-hover text-white font-semibold rounded-xl transition theme-btn"
              >
                Request a new link
              </Link>
            </div>
          )}

          {linkState === "valid" && (
            <>
              <h2 className="text-lg font-semibold text-theme-text mb-6">Set a new password</h2>

              {error && (
                <div
                  id="update-error"
                  role="alert"
                  className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="text-sm text-theme-muted block mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoFocus
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "update-error" : "password-hint"}
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
                  <p id="password-hint" className="text-xs text-theme-muted mt-1.5">
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirm" className="text-sm text-theme-muted block mb-1.5">
                    Confirm new password
                  </label>
                  <input
                    id="confirm"
                    name="confirm"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); if (error) setError(null); }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "update-error" : undefined}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="w-full mt-2 py-3 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 theme-btn"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                    : "Update password"}
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

export default function UpdatePasswordPage() {
  return <Suspense><UpdatePasswordForm /></Suspense>;
}
