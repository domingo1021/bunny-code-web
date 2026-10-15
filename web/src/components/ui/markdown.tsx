import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a question prompt.
 *
 * Replaces `vue3-markdown-it` plus a `highlight.js` theme imported by two
 * separate views. `react-markdown` does not use `innerHTML`, so prompt content
 * cannot inject markup — which matters because prompts are fetched from a URL
 * the page does not control.
 *
 * Styles are explicit rather than from a typography plugin, so the prose
 * matches the app's own tokens instead of carrying its own palette.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-ink-muted flex flex-col gap-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h2 className="text-ink text-xl font-semibold">{c}</h2>
          ),
          h2: ({ children: c }) => (
            <h3 className="text-ink mt-2 text-base font-semibold">{c}</h3>
          ),
          h3: ({ children: c }) => (
            <h4 className="text-ink mt-2 text-sm font-semibold">{c}</h4>
          ),
          p: ({ children: c }) => <p>{c}</p>,
          ul: ({ children: c }) => <ul className="list-disc pl-5">{c}</ul>,
          ol: ({ children: c }) => <ol className="list-decimal pl-5">{c}</ol>,
          li: ({ children: c }) => <li className="mt-1">{c}</li>,
          code: ({ children: c }) => (
            <code className="bg-surface-raised text-ink rounded px-1 py-0.5 font-mono text-[0.8125rem]">
              {c}
            </code>
          ),
          pre: ({ children: c }) => (
            <pre className="border-edge bg-surface overflow-x-auto rounded-md border p-3 font-mono text-xs">
              {c}
            </pre>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="border-edge-strong text-ink-subtle border-l-2 pl-3">
              {c}
            </blockquote>
          ),
          table: ({ children: c }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {c}
              </table>
            </div>
          ),
          th: ({ children: c }) => (
            <th className="border-edge bg-surface-raised text-ink border px-2 py-1 font-semibold">
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td className="border-edge border px-2 py-1">{c}</td>
          ),
          strong: ({ children: c }) => (
            <strong className="text-ink font-semibold">{c}</strong>
          ),
          a: ({ href, children: c }) => (
            <a
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              className="text-brand hover:underline"
            >
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
