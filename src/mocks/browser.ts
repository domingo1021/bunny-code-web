import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/**
 * Browser-side MSW instance.
 *
 * Unusually, this runs in production too: the deployed demo has no backend, so
 * the service worker *is* the API. `start` is called from a client component at
 * the root of the tree before anything fetches.
 */
export const worker = setupWorker(...handlers);
