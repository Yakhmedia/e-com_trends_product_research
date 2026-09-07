import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Lowered from 1.0 — see sentry.client.config.ts.
  tracesSampleRate: 0.1,

  // Redact API-key-shaped strings and sensitive headers before send — a
  // provider SDK error can carry the user's BYOK key in request context.
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,

  debug: false,
});
