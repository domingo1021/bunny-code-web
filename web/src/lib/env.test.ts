import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realtimeUrlFor } from "./env";

describe("realtimeUrlFor", () => {
  it.each([
    ["http://localhost:8080/api/v2", "ws://localhost:8080/api/v2/ws"],
    ["https://api.example.com/api/v2/", "wss://api.example.com/api/v2/ws"],
  ])("puts the STOMP endpoint next to %s", (api, expected) => {
    expect(realtimeUrlFor(api)).toBe(expected);
  });

  /* A relative base is the in-browser mock, which has no socket to reach. */
  it("has no socket for a relative API base", () => {
    expect(realtimeUrlFor("/api/v2")).toBeNull();
  });
});

describe("SERVER_API_BASE_URL", () => {
  beforeEach(() => {
    // `env` is read once at import; each case needs a fresh module.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefers the private API URL for server-side rendering", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://bunny.example/api/v2");
    vi.stubEnv("API_INTERNAL_URL", "http://api:8080/api/v2");
    const env = await import("./env");
    expect(env.SERVER_API_BASE_URL).toBe("http://api:8080/api/v2");
    expect(env.API_BASE_URL).toBe("https://bunny.example/api/v2");
  });

  it("falls back to the public API URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://bunny.example/api/v2");
    const env = await import("./env");
    expect(env.SERVER_API_BASE_URL).toBe("https://bunny.example/api/v2");
  });
});
