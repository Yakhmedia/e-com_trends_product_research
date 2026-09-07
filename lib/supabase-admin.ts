import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only service-role client.
// NEVER import this in client components — SUPABASE_SERVICE_ROLE_KEY is not NEXT_PUBLIC_.
// Use only inside API route handlers after getAdminUser() has passed.

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");

  if (!serviceKey) {
    // In production the anon fallback silently downgrades every admin-client
    // read to an RLS-restricted one. Fail loudly instead of serving empty data.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not set. It is required in production — " +
          "the anon-key fallback is a development-only convenience."
      );
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) throw new Error("Supabase env vars not configured");
    console.warn("[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — using anon key (dev only)");
    _adminClient = createClient(url, anonKey);
    return _adminClient;
  }

  _adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}
