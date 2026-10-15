/**
 * Runtime configuration, resolved in one place.
 *
 * The app speaks the Bunny Code API v2: REST under `/api/v2` and STOMP over a
 * WebSocket at `/api/v2/ws`. With nothing configured, both are served in the
 * browser — REST by the MSW handlers and realtime by the scripted opponent —
 * which is what the deployed demo uses.
 */

/**
 * Where the REST API lives, e.g. `http://localhost:8080/api/v2`. Relative by
 * default, so MSW can serve it.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v2";

/**
 * Where server-side rendering reaches the API. In a deployment the Next.js
 * server and the API share a private network, so pages fetch from the API
 * directly (e.g. `http://api:8080/api/v2`) instead of going out through the
 * public host. Read at runtime and never exposed to the browser.
 */
export const SERVER_API_BASE_URL = process.env.API_INTERNAL_URL ?? API_BASE_URL;

/** True when HTTP is served by the MSW handlers rather than a real backend. */
export const USING_MOCK_API = process.env.NEXT_PUBLIC_API_URL === undefined;

/**
 * The STOMP endpoint. Defaults to `/ws` next to a real API, so pointing the
 * app at a backend needs one variable; set it explicitly when the WebSocket is
 * served from elsewhere (e.g. behind a different proxy).
 */
export const REALTIME_URL: string | null =
  process.env.NEXT_PUBLIC_REALTIME_URL ??
  (USING_MOCK_API ? null : realtimeUrlFor(API_BASE_URL));

/** True when realtime is simulated in the browser rather than over a socket. */
export const USING_MOCK_REALTIME = REALTIME_URL === null;

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_TEST = process.env.NODE_ENV === "test";

/** `http://host/api/v2` → `ws://host/api/v2/ws`. Exported for tests. */
export function realtimeUrlFor(apiBaseUrl: string): string | null {
  if (!/^https?:\/\//.test(apiBaseUrl)) return null;
  return `${apiBaseUrl.replace(/^http/, "ws").replace(/\/$/, "")}/ws`;
}
