import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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
