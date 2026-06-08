"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2 } from "lucide-react";
import { ChatMessage, TrendsData } from "@/lib/types";
import { classifyTrend } from "@/lib/trend-classifier";
import TrendBadge from "@/components/TrendBadge";

interface AIAgentProps {
  open: boolean;
  onClose: () => void;
  trendsData?: TrendsData;
}

const SUGGESTED_QUESTIONS = [
  "Is this a good product to sell year-round?",
  "Which regions should I target with ads?",
  "What rising queries suggest untapped niches?",
  "Should I source this product now or wait?",
  "How does seasonality affect my inventory planning?",
];

export default function AIAgent({ open, onClose, trendsData }: AIAgentProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm your product research analyst. Search for a keyword and I'll help you interpret the trends, find opportunities, and build a sourcing strategy.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg], trendsContext: trendsData }),
      });
      const json = await res.json() as { message: string };
      setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const classification = trendsData ? classifyTrend(trendsData.interest_over_time) : null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[430px] bg-theme-surface border-l border-theme-border z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-theme-accent flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-theme-text font-semibold text-sm">Research Analyst</p>
              <p className="text-green-400 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Online · GPT-4o mini
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-theme-muted hover:text-theme-text p-1.5 rounded-lg hover:bg-theme-elevated transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Context strip */}
        {trendsData && classification && (
          <div className="mx-4 mt-3 p-3 bg-theme-accent-soft border border-theme-border-accent rounded-xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs text-theme-muted">Analyzing:</span>{" "}
                <span className="text-theme-text font-semibold capitalize text-sm">{trendsData.keyword}</span>
                <span className="text-xs text-theme-muted ml-2">· {trendsData.date_range}</span>
              </div>
              <TrendBadge classification={classification} size="sm" />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === "assistant" ? "bg-theme-accent" : "bg-theme-elevated"}`}>
                {msg.role === "assistant"
                  ? <Bot className="w-4 h-4 text-white" />
                  : <User className="w-4 h-4 text-theme-muted" />}
              </div>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "assistant"
                  ? "bg-theme-elevated text-theme-text rounded-tl-sm"
                  : "bg-theme-accent text-white rounded-tr-sm"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
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
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions — only show when no user messages yet */}
        {messages.length === 1 && trendsData && (
          <div className="px-4 pb-2">
            <p className="text-xs text-theme-muted mb-2">Suggested questions</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
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
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about trends, products, strategy…"
              className="flex-1 bg-theme-elevated border border-theme-border text-theme-text placeholder-[color:var(--t-muted)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent transition"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-theme-accent hover:bg-theme-accent-hover disabled:opacity-50 text-white rounded-xl transition theme-btn"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
