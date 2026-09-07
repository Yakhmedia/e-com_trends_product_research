import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "viewer";

export interface AuthedUser {
  user: User;
  role: Role;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

/**
 * Any authenticated user with a known role. This is the default guard for
 * routes a `viewer` is allowed to reach (trend search, agent chat, own
 * history). It re-reads `role` from the database, so a demoted admin loses
 * access on the next request regardless of a stale JWT claim.
 *
 * Returns null when there is no session or the profile row is missing / has
 * an unrecognised role.
 */
export async function getUser(): Promise<AuthedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  if (role !== "admin" && role !== "viewer") return null;
  return { user, role };
}

/**
 * Authoritative admin check — queries the database directly, so it stays
 * correct even when the JWT `role` claim is stale. Admin-only surfaces
 * (knowledge-base writes, platform usage) keep using this.
 */
export async function getAdminUser(): Promise<User | null> {
  const authed = await getUser();
  return authed?.role === "admin" ? authed.user : null;
}
