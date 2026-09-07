import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // See sentry.server.config.ts. Defence in depth — the key never reaches
  // the browser, but breadcrumbs and network errors still get scrubbed.
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,

  integrations: [
    Sentry.replayIntegration({
      // Defaults, set explicitly: no session replay may ever record the
      // contents of a credential field or any other text on the page.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // 1.0 sends a trace for every single request. At 0.1 the sampling is still
  // ample for a low-traffic internal tool and keeps the quota (and bill) down.
  tracesSampleRate: 0.1,

  // Replay captures 10% of sessions, and 100% of sessions that hit an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  debug: false,
});
