import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Lowered from 1.0 — see sentry.client.config.ts.
  tracesSampleRate: 0.1,

  debug: false,
});
