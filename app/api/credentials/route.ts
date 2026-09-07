import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { isProvider, isKnownModel } from "@/lib/models";
import {
  listCredentials,
  saveCredential,
  markCredential,
  probeCredential,
  validateKeyFormat,
  keyHint,
} from "@/lib/credentials";

// GET  /api/credentials         → metadata for every provider the user has set
// POST /api/credentials         → save/replace a key (write-only; validated on save)

export async function GET() {
  const authed = await getUser();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ credentials: await listCredentials(authed.user.id) });
  } catch (err) {
    Sentry.captureException(err, { tags: { subsystem: "credentials" } });
    return NextResponse.json({ error: "Could not load credentials" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authed = await getUser();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { provider?: unknown; key?: unknown; defaultModel?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { provider, key, defaultModel } = body;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (typeof key !== "string") {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  const formatError = validateKeyFormat(provider, key);
  if (formatError) {
    return NextResponse.json({ error: formatError }, { status: 400 });
  }
  const model =
    typeof defaultModel === "string" && isKnownModel(provider, defaultModel)
      ? defaultModel
      : null;

  try {
    // Probe before we store it — convert "unavailable in three days" into
    // "this key is invalid" right now.
    const status = await probeCredential(provider, key);
    await saveCredential(authed.user.id, provider, key, model);
    if (status !== "untested") await markCredential(authed.user.id, provider, status);

    return NextResponse.json({ provider, status, key_hint: keyHint(key) });
  } catch (err) {
    // Never let a key reach Sentry — scrubbed anyway, but don't rely on it.
    Sentry.captureException(err instanceof Error ? new Error(err.message) : err, {
      tags: { subsystem: "credentials", provider },
    });
    return NextResponse.json({ error: "Could not save the key" }, { status: 500 });
  }
}
