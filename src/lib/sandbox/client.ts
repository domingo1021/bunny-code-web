import { timeoutResult } from "@/core/sandbox/evaluate";
import {
  DEFAULT_LIMITS,
  type SandboxLimits,
  type SandboxRequest,
  type SandboxResponse,
  type SandboxResult,
} from "@/core/sandbox/types";

/**
 * Runs user code in a worker, and kills the worker if it overstays.
 *
 * The timeout has to live out here. A synchronous `while (true) {}` never
 * yields, so nothing inside that thread can interrupt it — the only way out is
 * for the owner to terminate the worker, which is exactly what this does. That
 * is the browser equivalent of the memory and time caps the original's Docker
 * sandbox enforced, and it is why "Run code" cannot hang the tab.
 *
 * A fresh worker is spawned per run rather than pooled. Pooling would be
 * cheaper, but after a timeout the worker has to be discarded anyway, and a
 * reused realm could leak state (globals, timers) from one run into the next —
 * which would make results depend on run order.
 */
export class SandboxRunner {
  #worker: Worker | null = null;
  #limits: SandboxLimits;
  #nextID = 0;

  constructor(limits: SandboxLimits = DEFAULT_LIMITS) {
    this.#limits = limits;
  }

  /** Run `source`, resolving with a result rather than rejecting on error. */
  async run(source: string): Promise<SandboxResult> {
    this.cancel();

    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker = worker;

    const id = `run-${(this.#nextID += 1)}`;

    return new Promise<SandboxResult>((resolve) => {
      let settled = false;

      const finish = (result: SandboxResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        if (this.#worker === worker) this.#worker = null;
        resolve(result);
      };

      const timer = setTimeout(
        () => finish(timeoutResult(this.#limits)),
        this.#limits.timeoutMs,
      );

      worker.addEventListener(
        "message",
        (event: MessageEvent<SandboxResponse>) => {
          if (event.data?.type === "result" && event.data.id === id) {
            finish(event.data.result);
          }
        },
      );

      /*
       * A worker that fails to start — a syntax error in the worker bundle, a
       * blocked blob URL — would otherwise leave the caller waiting for the
       * full timeout with no explanation.
       */
      worker.addEventListener("error", (event) => {
        finish({
          status: "error",
          logs: [],
          output: "",
          error: `Could not start the sandbox: ${event.message || "unknown error"}`,
          durationMs: 0,
          truncated: false,
        });
      });

      const request: SandboxRequest = {
        type: "run",
        id,
        source,
        limits: this.#limits,
      };
      worker.postMessage(request);
    });
  }

  /** Terminate any run in flight. Safe to call when nothing is running. */
  cancel(): void {
    this.#worker?.terminate();
    this.#worker = null;
  }
}

/**
 * Build the program to execute: the user's file, then one printing line per
 * test case. Judging compares the printed lines in order.
 */
export function programFor(
  source: string,
  cases: readonly { input: string }[],
): string {
  return [source, ...cases.map((testCase) => testCase.input)].join("\n");
}
