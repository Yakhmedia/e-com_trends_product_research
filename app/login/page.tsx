"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { BarChart2, Loader2, AlertCircle } from "lucide-react";

function LoginForm() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const redirectTo  = searchParams.get("redirectTo") ?? "/dashboard";
  const unauthorized = searchParams.get("error") === "unauthorized";

  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(unauthorized ? "Access restricted to admins only." : null);

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirectTo);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError(authError?.message ?? "Login failed");
      setLoading(false);
      return;
    }

    // Only upsert id + email — never self-assign role.
    // Admin role must be granted directly in the database by a DBA.
    await supabase.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email ?? email,
    }, { onConflict: "id" });

    router.replace(redirectTo);
  };

  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-theme-accent rounded-2xl mb-4">
            <BarChart2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-theme-text">Product Trends</h1>
          <p className="text-theme-muted text-sm mt-1">Admin access only</p>
        </div>

        <div className="bg-theme-surface border border-theme-border rounded-2xl p-8 shadow-[var(--t-shadow)] theme-card">
          <h2 className="text-lg font-semibold text-theme-text mb-6">Sign in to your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm text-theme-muted block mb-1.5">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
              />
            </div>
            <div>
              <label className="text-sm text-theme-muted block mb-1.5">Password</label>
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full mt-2 py-3 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 theme-btn"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
