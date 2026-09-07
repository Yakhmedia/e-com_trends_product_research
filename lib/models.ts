// Static model catalogue. Drives the settings model dropdown, the agent
// header label, and cost estimation (Phase 4.3).
//
// Prices are USD per 1M tokens and move often — treat them as estimates for
// display, not billing. Verify against each provider's pricing page when they
// look stale. Model IDs are the strings passed to the Vercel AI SDK provider
// factories (`openai(id)`, `anthropic(id)`, `google(id)`).

export const PRICING_AS_OF = "2026-09";

export type Provider = "openai" | "anthropic" | "google";

export const PROVIDERS: Provider[] = ["openai", "anthropic", "google"];

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export interface ModelInfo {
  provider: Provider;
  id: string;
  label: string;
  /** Max input tokens (context window). */
  contextWindow: number;
  /** Max tokens the model will generate in one response. */
  maxOutputTokens: number;
  price: {
    inputPerMTok: number;
    outputPerMTok: number;
  };
  /** Supports extended / adaptive reasoning ("thinking"). */
  reasoning: boolean;
  /** The pick pre-selected for a provider when the user hasn't chosen one. */
  isDefault?: boolean;
}

export const MODELS: ModelInfo[] = [
  // ── OpenAI ────────────────────────────────────────────────
  {
    provider: "openai",
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    price: { inputPerMTok: 0.05, outputPerMTok: 0.4 },
    reasoning: true,
  },
  {
    provider: "openai",
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    price: { inputPerMTok: 0.25, outputPerMTok: 2.0 },
    reasoning: true,
    isDefault: true,
  },
  {
    provider: "openai",
    id: "gpt-5",
    label: "GPT-5",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    price: { inputPerMTok: 1.25, outputPerMTok: 10.0 },
    reasoning: true,
  },
  {
    provider: "openai",
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    price: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
    reasoning: false,
  },

  // ── Anthropic ─────────────────────────────────────────────
  {
    provider: "anthropic",
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    price: { inputPerMTok: 1.0, outputPerMTok: 5.0 },
    reasoning: true,
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    price: { inputPerMTok: 2.0, outputPerMTok: 10.0 },
    reasoning: true,
    isDefault: true,
  },
  {
    provider: "anthropic",
    id: "claude-opus-5",
    label: "Claude Opus 5",
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    price: { inputPerMTok: 5.0, outputPerMTok: 25.0 },
    reasoning: true,
  },

  // ── Google ────────────────────────────────────────────────
  {
    provider: "google",
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_000,
    price: { inputPerMTok: 0.1, outputPerMTok: 0.4 },
    reasoning: false,
  },
  {
    provider: "google",
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_000,
    price: { inputPerMTok: 0.5, outputPerMTok: 3.0 },
    reasoning: true,
    isDefault: true,
  },
  {
    provider: "google",
    id: "gemini-3-pro-preview",
    label: "Gemini 3 Pro",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_000,
    price: { inputPerMTok: 2.0, outputPerMTok: 12.0 },
    reasoning: true,
  },
];

export function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as string[]).includes(v);
}

export function modelsForProvider(provider: Provider): ModelInfo[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function getModel(provider: Provider, id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.provider === provider && m.id === id);
}

export function defaultModelFor(provider: Provider): ModelInfo {
  const list = modelsForProvider(provider);
  return list.find((m) => m.isDefault) ?? list[0];
}

export function isKnownModel(provider: Provider, id: string): boolean {
  return getModel(provider, id) !== undefined;
}

/** Estimated USD cost of one call. */
export function estimateCost(
  model: Pick<ModelInfo, "price">,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1_000_000) * model.price.inputPerMTok +
    (outputTokens / 1_000_000) * model.price.outputPerMTok
  );
}
