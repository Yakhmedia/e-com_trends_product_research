import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { isProvider } from "@/lib/models";
import { getDecryptedKey, markCredential, probeCredential } from "@/lib/credentials";

// POST /api/credentials/:provider/test → re-probe the stored key, update status

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const authed = await getUser();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await ctx.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  try {
    const key = await getDecryptedKey(authed.user.id, provider);
    if (!key) {
      return NextResponse.json({ error: "No key saved for this provider" }, { status: 404 });
    }

    const status = await probeCredential(provider, key);
    if (status !== "untested") await markCredential(authed.user.id, provider, status);

    return NextResponse.json({ provider, status });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? new Error(err.message) : err, {
      tags: { subsystem: "credentials", provider },
    });
    return NextResponse.json({ error: "Could not test the key" }, { status: 500 });
  }
}
