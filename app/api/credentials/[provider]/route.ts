import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUser } from "@/lib/auth";
import { isProvider, isKnownModel } from "@/lib/models";
import { deleteCredential, setDefaultModel } from "@/lib/credentials";

// DELETE /api/credentials/:provider          → remove the key + its vault secret
// PATCH  /api/credentials/:provider          → { defaultModel } — change model only

export async function DELETE(
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
    await deleteCredential(authed.user.id, provider);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    Sentry.captureException(err, { tags: { subsystem: "credentials", provider } });
    return NextResponse.json({ error: "Could not remove the key" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const authed = await getUser();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = await ctx.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  let body: { defaultModel?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.defaultModel !== "string" || !isKnownModel(provider, body.defaultModel)) {
    return NextResponse.json({ error: "Unknown model for this provider" }, { status: 400 });
  }

  try {
    await setDefaultModel(authed.user.id, provider, body.defaultModel);
    return NextResponse.json({ provider, default_model: body.defaultModel });
  } catch (err) {
    Sentry.captureException(err, { tags: { subsystem: "credentials", provider } });
    return NextResponse.json({ error: "Could not update the model" }, { status: 500 });
  }
}
