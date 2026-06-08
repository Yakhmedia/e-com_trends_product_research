import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — evaluated at runtime, not at build time.
// This prevents "supabaseUrl is required" crashes during next build.
let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  _client = createClient(url, key);
  return _client;
}

// Kept for any legacy imports — resolves lazily
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseBrowserClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
