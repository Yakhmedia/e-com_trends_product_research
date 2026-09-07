// Liveness probe. Public (see proxy.ts PUBLIC_PATHS) and always 200 so
// platform health checks — Vercel, Docker HEALTHCHECK, uptime monitors —
// don't get a 307 to /login. Deliberately does not touch the database:
// this answers "is the app process up", not "is every dependency healthy".

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
