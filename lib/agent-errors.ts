// Error taxonomy for the AI analyst route.
//
// Every upstream failure used to collapse to one 502 and "Please try again" —
// which is wrong for exhausted credits (retrying can never succeed) and for a
// revoked key. Callers get a stable `code` the UI can branch on.
//
// Duck-typed on `status` / `code` rather than `instanceof` so it survives the
// error being re-wrapped, and so the same function can classify the Vercel AI
// SDK's errors in Phase 3.

export type AgentErrorCode =
  | "no_credits" // provider account is out of funds — not retryable
  | "bad_key" // key missing scope, revoked, or wrong — not retryable
  | "rate_limited" // provider throttling — retryable after a wait
  | "too_long" // request exceeded the model's context window
  | "upstream_down" // timeout, connection error, or provider 5xx
  | "unknown";

export interface ClassifiedAgentError {
  code: AgentErrorCode;
  status: number; // HTTP status for our response
  message: string; // safe, user-facing — never contains the key or raw provider text
  retryable: boolean;
}

function readNum(o: unknown, k: string): number | undefined {
  const v = (o as Record<string, unknown> | null | undefined)?.[k];
  return typeof v === "number" ? v : undefined;
}

function readStr(o: unknown, k: string): string | undefined {
  const v = (o as Record<string, unknown> | null | undefined)?.[k];
  return typeof v === "string" ? v : undefined;
}

export function classifyUpstreamError(err: unknown): ClassifiedAgentError {
  const status = readNum(err, "status") ?? readNum(err, "statusCode");
  // OpenAI nests the machine code at err.code; some SDKs use err.error.code.
  const providerCode =
    readStr(err, "code") ??
    readStr((err as { error?: unknown } | null)?.error, "code") ??
    readStr((err as { data?: unknown } | null)?.data, "code") ??
    "";
  const name = readStr(err, "name") ?? "";
  // The Vercel AI SDK's APICallError carries the raw provider response on
  // `.responseBody`; fold it into the text we pattern-match.
  const rawMessage =
    (readStr(err, "message") ?? "") + " " + (readStr(err, "responseBody") ?? "");

  // ── No credits — a 429 whose body says quota, or an explicit billing code ──
  if (
    providerCode === "insufficient_quota" ||
    providerCode === "billing_hard_limit_reached" ||
    /insufficient[_\s]quota|exceeded your current quota|billing/i.test(rawMessage)
  ) {
    return {
      code: "no_credits",
      status: 503,
      message: "This provider account is out of credits. Add funds or switch providers in Settings.",
      retryable: false,
    };
  }

  // ── Bad / revoked key ──
  if (status === 401 || status === 403 || providerCode === "invalid_api_key") {
    return {
      code: "bad_key",
      status: 502,
      message: "The API key was rejected. Check or replace it in Settings.",
      retryable: false,
    };
  }

  // ── Context length ──
  if (
    providerCode === "context_length_exceeded" ||
    providerCode === "string_above_max_length" ||
    /context length|maximum context|too many tokens|prompt is too long/i.test(rawMessage)
  ) {
    return {
      code: "too_long",
      status: 400,
      message: "This conversation is too long for the model. Start a new chat.",
      retryable: false,
    };
  }

  // ── Rate limited (retryable) ──
  if (status === 429 || providerCode === "rate_limit_exceeded") {
    return {
      code: "rate_limited",
      status: 429,
      message: "The AI provider is rate-limiting requests. Try again in a moment.",
      retryable: true,
    };
  }

  // ── Timeout / connection / provider 5xx ──
  if (
    (status !== undefined && status >= 500) ||
    /timeout|timed out/i.test(name + rawMessage) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|und_err/i.test(name + rawMessage) ||
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError"
  ) {
    return {
      code: "upstream_down",
      status: 503,
      message: "The AI analyst is temporarily unavailable. Try again shortly.",
      retryable: true,
    };
  }

  return {
    code: "unknown",
    status: 502,
    message: "The AI analyst hit an unexpected error. Try again shortly.",
    retryable: true,
  };
}
