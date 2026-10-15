import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  /* Vite resolves the "@/*" alias straight from tsconfig.json, so there is one
     place where paths are declared and no vite-tsconfig-paths plugin. */
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    /* Two projects, because src/core is pure TypeScript and has no business
       paying for a DOM. Keeping it in a node project also means an accidental
       `document` reference in core fails the test run. */
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: ["src/core/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/{app,components,features,lib,mocks}/**/*.test.{ts,tsx}",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],

      /*
       * Coverage measures the layers unit tests are the right tool for: the
       * pure domain logic, the fetch/schema boundary, hooks, state machines
       * and the mock backend.
       *
       * React components and route files are deliberately out of scope. They
       * are covered by the Playwright suite, which drives the real browser on
       * desktop and mobile and asserts accessibility with axe — re-asserting
       * the same behaviour against jsdom would duplicate that at a lower
       * fidelity, and a global percentage that averaged the two would say
       * less about either. Everything here is still typechecked and linted.
       */
      include: [
        "src/core/**/*.ts",
        "src/lib/**/*.ts",
        "src/mocks/**/*.ts",
        "src/features/**/{api,hooks,model}/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        // Runs inside a Web Worker, so it is exercised by the E2E suite
        // (the infinite-loop and runtime-error tests) rather than here.
        "src/lib/sandbox/worker.ts",
        /*
         * Server-only, and calls `cacheLife`, which needs Next's cache scope —
         * it cannot execute under a bare Vitest run at all. The home-page E2E
         * test asserts its output instead, by checking the server-rendered
         * top-three grid.
         */
        "src/features/projects/api/seed-catalogue.ts",
      ],

      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        /* The domain logic is pure and is the reason this rewrite exists, so
           it is held to a much higher bar than anything around it. */
        "src/core/**/*.ts": {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
      },
    },
  },
});
