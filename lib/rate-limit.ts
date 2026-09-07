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
 * Fails OPEN: if the database is unreachable we allow the request rather than
 * take the whole app down. The event is reported to Sentry so it is visible.
 */
export async function checkRateLimit(
  bucket: "trends" | "agent",
  userId: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
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
    console.error(`[rate-limit] check failed for ${bucket}:`, err);
    Sentry.captureException(err, {
      level: "warning",
      tags: { bucket, subsystem: "rate-limit" },
      extra: { note: "Rate limit check failed — request allowed (fail-open)" },
    });
    return { allowed: true, count: 0, retryAfter: 0 };
  }
}
