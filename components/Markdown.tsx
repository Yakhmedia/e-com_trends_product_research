"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Compact Markdown renderer for chat bubbles. The analyst is prompted to
// answer in short Markdown (bullets, bold, the occasional table), so the
// component set is deliberately small and inherits the bubble's colours.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="marker:text-theme-muted">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <p className="font-semibold text-[0.95rem]">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-[0.95rem]">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          code: ({ children }) => (
            <code className="bg-black/20 rounded px-1 py-0.5 text-[0.85em]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-black/20 rounded-lg p-2.5 overflow-x-auto text-[0.85em]">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-theme-border px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-theme-border px-2 py-1">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
