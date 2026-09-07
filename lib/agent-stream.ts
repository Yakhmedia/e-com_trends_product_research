// Phase 5 — provider fallback chain.
//
// Streams the analyst response, trying each resolved candidate in order. If a
// candidate fails *before emitting any content* with a retryable class
// (no_credits, rate_limited, bad_key, upstream_down) and another candidate is
// available, it silently moves to the next one. Once content has started
// streaming, the response is committed — a mid-stream failure surfaces as an
// error, it is not restarted.
//
// The client sees which provider answered via the `start` chunk's metadata.
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
  type TextStreamPart,
  type ToolSet,
  type LanguageModelUsage,
  type FinishReason,
} from "ai";
import { classifyUpstreamError, type AgentErrorCode } from "./agent-errors";
import { getModel } from "./models";
import type { ResolvedModel } from "./agent-provider";

const RETRYABLE_FALLBACK = new Set<AgentErrorCode>([
  "no_credits",
  "rate_limited",
  "bad_key",
  "upstream_down",
]);

// Stream parts that mean "the model has started responding — commit".
const CONTENT_PARTS = new Set([
  "text-start",
  "text-delta",
  "reasoning-start",
  "reasoning-delta",
  "tool-call",
  "tool-input-start",
]);

type Part = TextStreamPart<ToolSet>;

function replay(buffered: Part[], rest: AsyncIterator<Part>): ReadableStream<Part> {
  let i = 0;
  return new ReadableStream<Part>({
    async pull(controller) {
      if (i < buffered.length) {
        controller.enqueue(buffered[i++]);
        return;
      }
      const next = await rest.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
  });
}

export interface StreamWithFallbackParams {
  candidates: ResolvedModel[];
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature: number;
  abortSignal?: AbortSignal;
  originalMessages: UIMessage[];
  /** Called when a candidate fails and we move on — used to mark the credential. */
  onCandidateFailed: (candidate: ResolvedModel, code: AgentErrorCode) => void;
  /** Called once, for the candidate that actually answered. */
  onAnswered: (
    candidate: ResolvedModel,
    usage: LanguageModelUsage | undefined,
    finishReason: FinishReason | undefined
  ) => void;
}

export function streamWithFallback(params: StreamWithFallbackParams): Response {
  const {
    candidates,
    system,
    messages,
    maxOutputTokens,
    temperature,
    abortSignal,
    originalMessages,
    onCandidateFailed,
    onAnswered,
  } = params;

  const stream = createUIMessageStream<UIMessage>({
    originalMessages,
    onError: (error) => classifyUpstreamError(error).message,
    execute: async ({ writer }) => {
      let lastError: unknown;

      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const canFallback = i < candidates.length - 1;
        const info = getModel(cand.provider, cand.modelId);

        const result = streamText({
          model: cand.model,
          system,
          messages,
          temperature,
          maxOutputTokens: Math.min(maxOutputTokens, info?.maxOutputTokens ?? maxOutputTokens),
          maxRetries: 0,
          abortSignal,
          providerOptions:
            cand.provider === "anthropic"
              ? {
                  anthropic: {
                    thinking: { type: "adaptive" },
                    cacheControl: { type: "ephemeral" },
                  },
                }
              : undefined,
          onError: () => {}, // inspected via the stream below
        });

        const iterator = result.fullStream[Symbol.asyncIterator]();
        const buffered: Part[] = [];
        let decision: "commit" | "fallback" | "fail" = "commit";

        try {
          // Buffer control parts until content starts or an error arrives.
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            buffered.push(next.value);

            if (next.value.type === "error") {
              lastError = next.value.error;
              const code = classifyUpstreamError(next.value.error).code;
              onCandidateFailed(cand, code);
              decision = canFallback && RETRYABLE_FALLBACK.has(code) ? "fallback" : "fail";
              break;
            }
            if (CONTENT_PARTS.has(next.value.type)) break;
          }
        } catch (err) {
          // A thrown (network-level) error before any content.
          lastError = err;
          const code = classifyUpstreamError(err).code;
          onCandidateFailed(cand, code);
          if (canFallback && RETRYABLE_FALLBACK.has(code)) continue;
          throw err;
        }

        if (decision === "fallback") continue;
        if (decision === "fail") throw lastError;

        // Commit: replay what we buffered, then the rest of the stream.
        writer.merge(
          toUIMessageStream({
            stream: replay(buffered, iterator),
            originalMessages,
            messageMetadata: ({ part }) => {
              if (part.type === "start") {
                return { provider: cand.provider, model: cand.modelId, source: cand.source };
              }
              if (part.type === "finish") {
                return { finishReason: part.finishReason };
              }
            },
            onError: (error) => classifyUpstreamError(error).message,
          })
        );

        // Log usage once the model's own promises settle. Detached — it must
        // never block the merged stream from closing.
        void Promise.allSettled([
          Promise.resolve(result.totalUsage),
          Promise.resolve(result.finishReason),
        ]).then(([u, f]) => {
          onAnswered(
            cand,
            u.status === "fulfilled" ? u.value : undefined,
            f.status === "fulfilled" ? f.value : undefined
          );
        });
        return;
      }

      if (lastError) throw lastError;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
