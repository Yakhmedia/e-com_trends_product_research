"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X, Send, Bot, User, Loader2, AlertTriangle, Settings } from "lucide-react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";
import { getModel, defaultModelFor, type Provider } from "@/lib/models";
import TrendBadge from "@/components/TrendBadge";
import Markdown from "@/components/Markdown";

interface AIAgentProps {
  open: boolean;
  onClose: () => void;
  trendsData?: TrendsData;
}

interface AgentMeta {
  provider?: Provider;
  model?: string;
  source?: "byok" | "server";
  finishReason?: string;
}

const GREETING: UIMessage = {
  id: "greeting",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Hi! I'm your product research analyst. Search for a keyword and I'll help you interpret the trends, find opportunities, and build a sourcing strategy.",
    },
  ],
};

// Suggestions conditioned on the trend classification (Phase 5.4).
const SUGGESTIONS_BY_TYPE: Record<string, string[]> = {
  Seasonal: [
    "When should I order inventory for the next peak?",
    "How many weeks before the peak should ads start?",
    "How do I manage cash flow through the off-season?",
  ],
  "Trending Up": [
    "Is it too late to enter this market?",
    "Which rising queries point to an untapped niche?",
    "How aggressively should I bet on inventory here?",
  ],
  Declining: [
    "Which adjacent categories are trending up instead?",
    "Should I liquidate existing stock now?",
  ],
  Evergreen: [
    "How do I differentiate in a saturated evergreen market?",
    "What's a sensible long-term ad budget for this?",
  ],
  Niche: [
    "How big is this niche really?",
    "What long-tail keywords should I target?",
  ],
  Volatile: [
    "How small should my first test order be?",
    "What signals should I watch before committing inventory?",
  ],
};
const GENERIC_SUGGESTIONS = [
  "Is this a good product to sell year-round?",
  "Which regions should I target with ads?",
  "What rising queries suggest untapped niches?",
];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function AIAgent({ open, onClose, trendsData }: AIAgentProps) {
  const [input, setInput] = useState("");
  const [defaultModelLabel, setDefaultModelLabel] = useState<string | null>(null);
  const [hasAnyKey, setHasAnyKey] = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerFocusRef = useRef<HTMLElement | null>(null);

  const classification = useMemo(
    () => (trendsData ? classifyTrend(trendsData.interest_over_time) : null),
    [trendsData]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        // Send the full message list plus whatever per-call body was passed to
        // sendMessage() (the current trends context).
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { messages, ...body },
        }),
        // Surface our JSON error bodies ({ error, code }) as the thrown message
        // instead of a generic "Failed to fetch".
        fetch: async (input, init) => {
          const res = await fetch(input as string, init);
          if (!res.ok) {
            const errBody = (await res
              .clone()
              .json()
              .catch(() => null)) as { error?: string } | null;
            if (errBody?.error) throw new Error(errBody.error);
          }
          return res;
        },
      }),
    []
  );

  const { messages, sendMessage, status, error, stop, clearError, regenerate } = useChat({
    transport,
    messages: [GREETING],
  });

  const busy = status === "submitted" || status === "streaming";

  // Resolve the model label shown in the header: prefer what the server
  // actually used (message metadata), fall back to the user's default.
  const lastMeta = useMemo<AgentMeta | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.metadata) return m.metadata as AgentMeta;
    }
    return null;
  }, [messages]);

  const modelLabel = useMemo(() => {
    if (lastMeta?.provider && lastMeta.model) {
      return getModel(lastMeta.provider, lastMeta.model)?.label ?? lastMeta.model;
    }
    return defaultModelLabel;
  }, [lastMeta, defaultModelLabel]);

  const truncated = lastMeta?.finishReason === "length";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // One-time: what key / model will we use?
  useEffect(() => {
    let cancelled = false;
    fetch("/api/credentials")
      .then((r) => r.json())
      .then((j: { credentials?: { provider: Provider; default_model: string | null }[] }) => {
        if (cancelled) return;
        const creds = j.credentials ?? [];
        setHasAnyKey(creds.length > 0);
        const first = creds[0];
        if (first) {
          const id = first.default_model ?? defaultModelFor(first.provider).id;
          setDefaultModelLabel(getModel(first.provider, id)?.label ?? id);
        } else {
          setDefaultModelLabel(null);
        }
      })
      .catch(() => !cancelled && setHasAnyKey(null));
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Dialog semantics ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      openerFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    openerFocusRef.current?.focus?.();
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  const submit = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    if (error) clearError();
    setInput("");
    sendMessage({ text: content }, { body: { trendsContext: trendsData } });
  };

  const suggestions = classification
    ? SUGGESTIONS_BY_TYPE[classification.type] ?? GENERIC_SUGGESTIONS
    : GENERIC_SUGGESTIONS;
  const showSuggestions = messages.length === 1 && !!trendsData && !busy;

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Research analyst chat"
        inert={!open}
        onKeyDown={onKeyDown}
        className={`fixed top-0 right-0 h-full w-full sm:w-[430px] bg-theme-surface border-l border-theme-border z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-theme-accent flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-theme-text font-semibold text-sm">Research Analyst</p>
              <p className="text-theme-muted text-xs flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    modelLabel ? "bg-green-400" : "bg-theme-muted"
                  }`}
                />
                {modelLabel ?? "No provider key"}
                {lastMeta?.source === "server" && " · shared key"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="text-theme-muted hover:text-theme-text p-1.5 rounded-lg hover:bg-theme-elevated transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Context strip */}
        {trendsData && classification && (
          <div className="mx-4 mt-3 p-3 bg-theme-accent-soft border border-theme-border-accent rounded-xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs text-theme-muted">Analyzing:</span>{" "}
                <span className="text-theme-text font-semibold capitalize text-sm">
                  {trendsData.keyword}
                </span>
                <span className="text-xs text-theme-muted ml-2">· {trendsData.date_range}</span>
              </div>
              <TrendBadge classification={classification} size="sm" />
            </div>
          </div>
        )}

        {hasAnyKey === false && (
          <Link
            href="/settings"
            className="mx-4 mt-3 p-2.5 rounded-xl bg-theme-elevated border border-theme-border text-xs text-theme-muted hover:text-theme-text flex items-center gap-2 transition"
          >
            <Settings className="w-3.5 h-3.5" />
            Running on the shared trial key. Connect your own in Settings.
          </Link>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const text = msg.parts
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("");
            if (!text && msg.role === "assistant" && !busy) return null;
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                    msg.role === "assistant" ? "bg-theme-accent" : "bg-theme-elevated"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : (
                    <User className="w-4 h-4 text-theme-muted" />
                  )}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-theme-elevated text-theme-text rounded-tl-sm"
                      : "bg-theme-accent text-white rounded-tr-sm whitespace-pre-wrap"
                  }`}
                >
                  {msg.role === "assistant" ? <Markdown>{text}</Markdown> : text}
                </div>
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-theme-accent flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-theme-elevated rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-theme-accent animate-spin" />
                <span className="text-theme-muted text-sm">Thinking…</span>
              </div>
            </div>
          )}

          {truncated && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              The answer was cut off at the length limit.
            </p>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-4 h-4" /> {error.message || "Something went wrong."}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => {
                    clearError();
                    regenerate({ body: { trendsContext: trendsData } });
                  }}
                  className="text-xs underline hover:no-underline"
                >
                  Try again
                </button>
                <Link href="/settings" className="text-xs underline hover:no-underline">
                  Manage keys
                </Link>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions */}
        {showSuggestions && (
          <div className="px-4 pb-2">
            <p className="text-xs text-theme-muted mb-2">Suggested questions</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => submit(q)}
                  className="text-xs bg-theme-elevated hover:bg-theme-accent-soft text-theme-muted hover:text-theme-accent border border-theme-border rounded-lg px-2.5 py-1.5 transition text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-theme-border">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about trends, products, strategy…"
              className="flex-1 bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
            />
            {busy ? (
              <button
                onClick={() => stop()}
                aria-label="Stop generating"
                className="p-2.5 bg-theme-elevated hover:bg-theme-border text-theme-text rounded-xl transition"
              >
                <span className="block w-4 h-4 bg-current rounded-[3px]" />
              </button>
            ) : (
              <button
                onClick={() => submit()}
                disabled={!input.trim()}
                aria-label="Send message"
                className="p-2.5 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 text-white rounded-xl transition theme-btn"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
