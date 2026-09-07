import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/update-password", "/health"];

// API routes that require auth — return JSON errors, not redirects
const PROTECTED_API_PATHS = ["/api/trends", "/api/agent", "/api/credentials"];

const KNOWN_ROLES = new Set(["admin", "viewer"]);

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

  const isApiRoute = PROTECTED_API_PATHS.some((p) => pathname.startsWith(p));

  // This project signs JWTs with asymmetric keys (ES256), so getClaims()
  // verifies the token locally via WebCrypto — no round-trip to the auth
  // server on every request the way getUser() did (the 600–800ms seen in the
  // dev logs). It still refreshes an about-to-expire token, writing the new
  // cookies onto `res` through setAll above.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims?.sub) {
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
  // getUser()/getAdminUser() re-check against the database and stay authoritative.
  const appMetadata = claims.app_metadata as { role?: string } | undefined;
  let role = appMetadata?.role;

  if (!role) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", claims.sub)
      .maybeSingle();

    // A failed lookup is not the same as "no access". Reporting it as
    // unauthorized sends the user round a silent redirect loop with no clue
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

  // Any known role (admin or viewer) may pass. Per-capability and admin-only
  // checks live in the route handlers (getUser / getAdminUser) and in RLS.
  if (!role || !KNOWN_ROLES.has(role)) {
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
    //   api        — route handlers do their own auth via getUser(); the
    //     two below are still matched explicitly for defense in depth.
    "/((?!_next/static|_next/image|favicon.ico|monitoring|api).*)",
    // Explicitly protect these API routes
    "/api/trends",
    "/api/agent",
    "/api/credentials/:path*",
  ],
};
