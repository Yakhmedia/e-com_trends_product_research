import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdminClient } from "./supabase-admin";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfter: number; // seconds until the window resets
}

/**
 * Durable, cross-instance rate limiting backed by public.rate_limits.
 *
 * The previous module-level Map reset on every serverless cold start and was
 * never shared between instances, which amounts to no limit at all in front of
 * two metered APIs. check_rate_limit() does the check and increment in a
 * single atomic statement, so concurrent requests cannot race past the cap.
 *
 * Fail mode when the database is unreachable:
 *   - failOpen (default): allow the request. Correct when the caller is
 *     spending their own money (BYOK) or when we were the only user.
 *   - failOpen: false: deny. Correct for anything spending a shared server
 *     key during a Supabase blip — an open bar is worse than a brief outage.
 * Either way the event is reported to Sentry so it stays visible.
 */
export async function checkRateLimit(
  bucket: "trends" | "agent",
  userId: string,
  limit: number,
  windowSeconds: number,
  opts: { failOpen?: boolean } = {}
): Promise<RateLimitResult> {
  const failOpen = opts.failOpen ?? true;
  try {
    const { data, error } = await getSupabaseAdminClient().rpc("check_rate_limit", {
      p_bucket: bucket,
      p_user_id: userId,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) throw new Error(error.message);

    const result = data as { allowed: boolean; count: number; retry_after: number };

    if (!result.allowed) {
      Sentry.captureMessage(`Rate limit exceeded: ${bucket}`, {
        level: "warning",
        tags: { bucket },
        extra: { userId, count: result.count, limit, windowSeconds },
      });
    }

    return {
      allowed: result.allowed,
      count: result.count,
      retryAfter: result.retry_after,
    };
  } catch (err) {
    console.error(`[rate-limit] check failed for ${bucket} (fail ${failOpen ? "open" : "closed"}):`, err);
    Sentry.captureException(err, {
      level: "warning",
      tags: { bucket, subsystem: "rate-limit" },
      extra: { note: `Rate limit check failed — request ${failOpen ? "allowed (fail-open)" : "denied (fail-closed)"}` },
    });
    return failOpen
      ? { allowed: true, count: 0, retryAfter: 0 }
      : { allowed: false, count: limit + 1, retryAfter: 30 };
  }
}
