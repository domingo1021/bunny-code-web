import { type RealtimeTransport } from "@/core/realtime/transport";
import { REALTIME_URL } from "@/lib/env";

/**
 * Build the realtime transport for this environment: STOMP against the real
 * API when one is configured, otherwise the in-browser scripted opponent.
 *
 * Both are loaded lazily so neither the STOMP client nor the mock opponent is
 * in the initial bundle.
 */
export async function createTransport(input: {
  userID: number;
  token: string | null;
}): Promise<RealtimeTransport> {
  if (REALTIME_URL !== null) {
    const { StompTransport } = await import("./stomp-transport");
    return new StompTransport(REALTIME_URL, input.token);
  }

  const { MockRealtimeTransport } =
    await import("@/mocks/realtime/mock-transport");
  return new MockRealtimeTransport(input.userID);
}
