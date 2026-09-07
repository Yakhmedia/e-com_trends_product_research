import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Lowered from 1.0 — see sentry.client.config.ts.
  tracesSampleRate: 0.1,

  // See sentry.server.config.ts.
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,

  debug: false,
});
