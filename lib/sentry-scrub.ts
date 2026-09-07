// Phase 2.5 — last line of defence before an event leaves the process.
//
// A provider SDK error can carry request context: the Authorization header,
// an `x-api-key` header, a JSON body echoed back in the message. With BYOK
// that context contains the *user's* key. Redact anything key-shaped, and
// drop known-sensitive headers wholesale, on every event and transaction.

const KEY_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic (before the generic sk- rule)
  /\bsk-[A-Za-z0-9_-]{20,}/g, // OpenAI (incl. sk-proj-…)
  /\bAIza[A-Za-z0-9_-]{16,}/g, // Google API keys
  /\bBearer\s+[A-Za-z0-9._-]{20,}/gi, // bearer tokens
];

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "openai-api-key",
  "x-goog-api-key",
  "x-goog-user-project",
  "anthropic-api-key",
  "cookie",
  "set-cookie",
]);

const REDACTED = "[redacted]";
const MAX_DEPTH = 8;

function redactString(input: string): string {
  let out = input;
  for (const re of KEY_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? REDACTED : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

// Typed structurally so it satisfies both `beforeSend` and
// `beforeSendTransaction` without importing Sentry's event unions (which the
// Next.js meta-package doesn't re-export by those names).
export function scrubEvent<T extends object>(event: T): T {
  return scrub(event) as T;
}
