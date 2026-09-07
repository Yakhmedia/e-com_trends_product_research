import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/update-password"];

// API routes that require admin auth — return JSON errors, not redirects
const PROTECTED_API_PATHS = ["/api/trends", "/api/agent"];

// Supabase's setAll writes refreshed tokens onto `res`. Returning a fresh
// NextResponse for a redirect or an error would discard them, signing out a
// user whose token happened to be mid-refresh. Carry them across instead.
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isApiRoute = PROTECTED_API_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isApiRoute) {
      return withCookies(res, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirectTo", pathname);
    return withCookies(res, NextResponse.redirect(loginUrl));
  }

  // Role comes from the JWT when the custom access-token hook is enabled
  // (migration 008). Fall back to a profiles query when the claim is absent —
  // hook not yet enabled, or a session issued before it was.
  // getAdminUser() re-checks against the database and stays authoritative.
  let role = (user.app_metadata as { role?: string } | undefined)?.role;

  if (!role) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    // A failed lookup is not the same as "you are not an admin". Reporting it
    // as unauthorized sends the user round a silent redirect loop with no clue
    // that the database is what is actually broken.
    if (error) {
      console.error("[proxy] profile lookup failed:", error.message);
      if (isApiRoute) {
        return withCookies(
          res,
          NextResponse.json({ error: "Could not verify permissions" }, { status: 503 })
        );
      }
      const errUrl = req.nextUrl.clone();
      errUrl.pathname = "/login";
      errUrl.search = "";
      errUrl.searchParams.set("error", "profile_lookup_failed");
      return withCookies(res, NextResponse.redirect(errUrl));
    }
    role = profile?.role;
  }

  if (role !== "admin") {
    if (isApiRoute) {
      return withCookies(res, NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("error", "unauthorized");
    return withCookies(res, NextResponse.redirect(loginUrl));
  }

  return res;
}

export const config = {
  matcher: [
    // Protect all page routes. Excludes Next.js internals, static files, and:
    //   monitoring — the Sentry tunnel (next.config.ts tunnelRoute). Redirecting
    //     it means errors thrown while signed out never reach Sentry.
    //   api        — route handlers do their own auth via getAdminUser(); the
    //     two below are still matched explicitly for defense in depth.
    "/((?!_next/static|_next/image|favicon.ico|monitoring|api).*)",
    // Explicitly protect these API routes
    "/api/trends",
    "/api/agent",
  ],
};
