/**
 * Running a user's code.
 *
 * The original app POSTed source to `/api/1.0/compiler`, which ran it in a
 * Docker container with a memory cap and a Prometheus exporter watching it.
 * That backend no longer exists, so execution moves into the browser: a Web
 * Worker evaluates the code off the main thread, and the page terminates the
 * worker if it outstays its welcome.
 *
 * That split is why `status: "timeout"` cannot come from inside the sandbox. A
 * synchronous `while (true) {}` never yields, so nothing running in the same
 * thread can interrupt it — only the owner of the worker can, by killing it.
 * The in-worker half (`runUserCode`) therefore reports `ok` or `error`, and the
 * client half turns an unanswered run into a `timeout`.
 */

export type SandboxStatus = "ok" | "error" | "timeout";

export interface SandboxLimits {
  /** Wall-clock budget before the worker is terminated. */
  readonly timeoutMs: number;
  /** Cap on captured output; anything beyond it is dropped. */
  readonly maxOutputChars: number;
  /** Cap on the number of captured console calls. */
  readonly maxLogEntries: number;
}

export const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: 3_000,
  maxOutputChars: 20_000,
  maxLogEntries: 1_000,
};

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
  readonly level: LogLevel;
  readonly text: string;
}

export interface SandboxResult {
  readonly status: SandboxStatus;
  readonly logs: readonly LogEntry[];
  /** Captured output as the terminal shows it, newline separated. */
  readonly output: string;
  /** Present when `status` is `"error"`; a formatted message, never an Error. */
  readonly error?: string;
  readonly durationMs: number;
  /** True when output hit `maxOutputChars` or `maxLogEntries`. */
  readonly truncated: boolean;
}

/** Message the page sends into the worker. */
export interface SandboxRequest {
  readonly type: "run";
  readonly id: string;
  readonly source: string;
  readonly limits: SandboxLimits;
}

/** Message the worker sends back. Errors are serialised, never thrown across. */
export interface SandboxResponse {
  readonly type: "result";
  readonly id: string;
  readonly result: SandboxResult;
}
