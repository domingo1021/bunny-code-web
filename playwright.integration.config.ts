import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real backend — no MSW, no scripted opponent.
 *
 * Needs the local stack running (see INSTRUCTION.md in the backend repo):
 * MySQL, Redis, InfluxDB and LocalStack from `Docker/local/compose.yaml`, and
 * the API on :8080 with the `local` profile. This config builds the frontend
 * against that API and serves it on its own port, so it never collides with a
 * `next dev` on :3000.
 *
 *   npm run test:integration
 *
 * Each test signs up its own fresh users through the API, so the suite can run
 * repeatedly against the same database.
 */
const PORT = Number(process.env.INTEGRATION_PORT ?? 3100);
export const API_URL =
  process.env.INTEGRATION_API_URL ?? "http://localhost:8080/api/v2";

export default defineConfig({
  testDir: "./e2e-integration",
  // Battles pair whoever is online, so the specs run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_PUBLIC_API_URL: API_URL },
  },
});
