-- ============================================================
-- 009_rate_limits.sql
-- Durable, cross-instance rate limiting.
--
-- Both API routes kept counters in a module-level Map. On a serverless
-- host that resets on every cold start and is not shared between
-- instances — effectively no limit at all, in front of two metered
-- third-party APIs (SerpAPI, OpenAI).
-- Run AFTER 008_access_token_hook.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,   -- 'trends' | 'agent'
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  count        integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, user_id)
);

-- RLS on with zero policies: unreachable by anon and authenticated.
-- Only the service-role key (which bypasses RLS) can touch it.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ── Atomic check-and-increment ───────────────────────────────
-- One statement, so concurrent requests cannot race past the limit the
-- way a read-then-write pair would.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket         text,
  p_user_id        uuid,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_now          timestamptz := now();
  v_expired_before timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count        integer;
  v_window_start timestamptz;
BEGIN
  INSERT INTO public.rate_limits AS rl (bucket, user_id, count, window_start)
  VALUES (p_bucket, p_user_id, 1, v_now)
  ON CONFLICT (bucket, user_id) DO UPDATE
    SET count = CASE WHEN rl.window_start < v_expired_before
                     THEN 1 ELSE rl.count + 1 END,
        window_start = CASE WHEN rl.window_start < v_expired_before
                            THEN v_now ELSE rl.window_start END
  RETURNING rl.count, rl.window_start INTO v_count, v_window_start;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count',   v_count,
    'retry_after',
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM
        (v_window_start + make_interval(secs => p_window_seconds)) - v_now
      ))::integer)
  );
END;
$func$;

-- Server-side only — callers use the service-role client.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, uuid, integer, integer)
  FROM authenticated, anon, public;

-- ── Housekeeping ─────────────────────────────────────────────
-- Rows are self-expiring (the window resets in place), so the table stays
-- at one row per user per bucket and needs no cleanup job.
