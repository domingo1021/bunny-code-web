/// <reference lib="webworker" />

import { runUserCode } from "@/core/sandbox/evaluate";
import {
  type SandboxRequest,
  type SandboxResponse,
} from "@/core/sandbox/types";

/**
 * The sandbox worker.
 *
 * This is where user code actually runs, and the isolation is structural: a
 * worker is a separate realm with no DOM, no `window`, and no handle on the
 * page. Combined with the page terminating it on timeout, that covers the two
 * things the original relied on a Docker container for — containment and a
 * runaway-loop kill switch — with no server involved.
 *
 * The worker deliberately holds no state between runs. Each message gets a
 * fresh evaluation, and `runUserCode` never throws, so a reply is always sent
 * and the page is never left waiting on a dead promise.
 */
self.addEventListener("message", (event: MessageEvent<SandboxRequest>) => {
  const request = event.data;
  if (request?.type !== "run") return;

  const result = runUserCode(request.source, { limits: request.limits });

  const response: SandboxResponse = {
    type: "result",
    id: request.id,
    result,
  };
  self.postMessage(response);
});
