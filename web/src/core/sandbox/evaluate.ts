import { formatArgs, formatThrown } from "./format";
import {
  DEFAULT_LIMITS,
  type LogEntry,
  type LogLevel,
  type SandboxLimits,
  type SandboxResult,
} from "./types";

/**
 * Collects console output under a budget.
 *
 * Capping both the number of entries and the total characters matters because
 * the code being run is a user's work in progress: `for (;;) console.log(i++)`
 * is a completely ordinary mistake, and without a cap it exhausts memory before
 * the timeout can fire.
 */
export function createConsoleCapture(limits: SandboxLimits = DEFAULT_LIMITS) {
  const logs: LogEntry[] = [];
  let characters = 0;
  let truncated = false;

  function push(level: LogLevel, args: readonly unknown[]): void {
    if (logs.length >= limits.maxLogEntries) {
      truncated = true;
      return;
    }
    const text = formatArgs(args);
    if (characters + text.length > limits.maxOutputChars) {
      const room = Math.max(limits.maxOutputChars - characters, 0);
      if (room > 0) {
        logs.push({ level, text: text.slice(0, room) });
        characters += room;
      }
      truncated = true;
      return;
    }
    logs.push({ level, text });
    characters += text.length;
  }

  /** A console-shaped object to expose to the sandboxed code. */
  const console: Record<LogLevel, (...args: unknown[]) => void> = {
    log: (...args) => push("log", args),
    info: (...args) => push("info", args),
    warn: (...args) => push("warn", args),
    error: (...args) => push("error", args),
    debug: (...args) => push("debug", args),
  };

  return {
    console,
    get logs(): readonly LogEntry[] {
      return logs;
    },
    get truncated(): boolean {
      return truncated;
    },
  };
}

export interface RunOptions {
  readonly limits?: SandboxLimits;
  /** Injected for deterministic durations in tests. */
  readonly now?: () => number;
}

/**
 * Evaluate user source and capture what it printed.
 *
 * **This must only ever be called inside a Web Worker.** It provides no
 * isolation of its own: `new Function` runs with whatever globals the calling
 * realm has. The isolation comes from the worker — a separate realm, no DOM, no
 * access to the page — and the timeout comes from the page terminating it.
 *
 * It resolves rather than rejects for user errors, because a syntax error in a
 * half-written program is the expected case, not an exceptional one.
 */
export function runUserCode(
  source: string,
  options: RunOptions = {},
): SandboxResult {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const now = options.now ?? defaultNow;
  const capture = createConsoleCapture(limits);
  const startedAt = now();

  const finish = (status: "ok" | "error", error?: string): SandboxResult => ({
    status,
    logs: capture.logs,
    output: capture.logs.map((entry) => entry.text).join("\n"),
    ...(error === undefined ? {} : { error }),
    durationMs: Math.max(now() - startedAt, 0),
    truncated: capture.truncated,
  });

  let program: (console: unknown) => unknown;
  try {
    // Compiling separately from running keeps a syntax error distinguishable
    // from a runtime throw, and keeps `source` out of the enclosing scope.
    program = new Function("console", `"use strict";\n${source}\n`) as (
      console: unknown,
    ) => unknown;
  } catch (thrown) {
    return finish("error", formatThrown(thrown));
  }

  try {
    program(capture.console);
  } catch (thrown) {
    return finish("error", formatThrown(thrown));
  }

  return finish("ok");
}

function defaultNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** The result the page reports when it had to terminate a run. */
export function timeoutResult(limits: SandboxLimits): SandboxResult {
  return {
    status: "timeout",
    logs: [],
    output: "",
    error: `Execution timed out after ${limits.timeoutMs}ms. Check for an infinite loop.`,
    durationMs: limits.timeoutMs,
    truncated: false,
  };
}
