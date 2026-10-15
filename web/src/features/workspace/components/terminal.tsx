"use client";

import { Loader2, Play, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { type SandboxResult } from "@/core/sandbox/types";
import { cn } from "@/lib/cn";
import { USING_MOCK_API } from "@/lib/env";

export interface TerminalEntry {
  readonly id: number;
  readonly command: string;
  readonly result: SandboxResult;
}

/**
 * Output from running the user's code.
 *
 * Three things the original got wrong, all visible to the user:
 *
 * - It pushed raw response bodies into an array and rendered them with
 *   `white-space: pre-line`, so a failure showed whatever the server happened
 *   to send — including `[object Object]` when the error was not a string.
 * - It scrolled to the bottom with a `watch` on the array length plus
 *   `nextTick`, which fired before layout had settled and often stopped a line
 *   short.
 * - Nothing was announced, so a screen-reader user had no idea the run had
 *   finished. The output region is a live log here.
 */
export function Terminal({
  entries,
  projectName,
  isRunning,
  onRun,
  onClear,
  canRun,
}: {
  entries: readonly TerminalEntry[];
  projectName: string;
  isRunning: boolean;
  onRun: () => void;
  onClear: () => void;
  canRun: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * Scroll on entry count rather than on content, and after paint, so the last
   * line is always fully visible.
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
  }, [entries.length]);

  return (
    <section
      aria-label="Terminal"
      className="border-edge bg-canvas flex min-h-0 flex-col border-t"
    >
      <header className="border-edge flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-ink-muted text-xs font-medium">Terminal</h2>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              aria-label="Clear terminal"
            >
              <Trash2 aria-hidden="true" />
              Clear
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onRun}
            disabled={isRunning || !canRun}
          >
            {isRunning ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {isRunning ? "Running…" : "Run code"}
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        // `log` with polite updates: a finished run is worth announcing, but
        // not worth interrupting whatever is being read.
        role="log"
        aria-live="polite"
        aria-atomic="false"
        className="min-h-40 flex-1 overflow-y-auto px-3 py-2 font-mono text-sm"
      >
        {entries.length === 0 ? (
          <p className="text-ink-subtle">
            Press <strong className="text-ink-muted">Run code</strong> to
            execute this file in a{" "}
            {USING_MOCK_API ? "sandboxed worker" : "sandbox on the server"}.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p className="text-ink-subtle">
                  <span className="text-brand">bunny-code</span>
                  <span aria-hidden="true"> / </span>
                  <span className="sr-only"> in </span>
                  {projectName}
                  <span aria-hidden="true"> % </span>
                  <span className="sr-only">: </span>
                  {entry.command}
                </p>
                <TerminalOutput result={entry.result} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TerminalOutput({ result }: { result: SandboxResult }) {
  const tone =
    result.status === "ok"
      ? "text-ink"
      : result.status === "timeout"
        ? "text-warning"
        : "text-danger";

  return (
    <div className="mt-1 flex flex-col gap-1">
      {result.output !== "" && (
        <pre className="text-ink break-words whitespace-pre-wrap">
          {result.output}
        </pre>
      )}

      {result.error !== undefined && (
        <pre className={cn("break-words whitespace-pre-wrap", tone)}>
          {result.error}
        </pre>
      )}

      {result.output === "" && result.error === undefined && (
        <p className="text-ink-subtle">
          Ran without printing anything in {Math.round(result.durationMs)}ms.
        </p>
      )}

      {result.truncated && (
        <p className="text-warning text-xs">
          Output was truncated — this printed more than the terminal will hold.
        </p>
      )}
    </div>
  );
}
