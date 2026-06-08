import * as Sentry from "@sentry/nextjs";
import "./sentry.client.config";

// Required by Sentry v10 to capture navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
