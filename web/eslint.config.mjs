import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "public/mockServiceWorker.js",
  ]),

  {
    name: "bunnycode/general",
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },

  {
    /* `src/core` is pure domain logic: no React, no Next, no browser globals
       beyond what a worker has, no reaching into feature slices. Enforcing it
       here is what keeps it unit-testable in isolation. */
    name: "bunnycode/core-is-pure",
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/core must stay framework-free." },
            {
              name: "react-dom",
              message: "src/core must stay framework-free.",
            },
            { name: "next", message: "src/core must stay framework-free." },
            { name: "zustand", message: "src/core must stay framework-free." },
            {
              name: "@tanstack/react-query",
              message: "src/core must stay framework-free.",
            },
          ],
          patterns: [
            {
              group: ["next/*", "@/features/*", "@/app/*", "@/components/*"],
              message:
                "src/core must not depend on the framework or feature slices.",
            },
          ],
        },
      ],
    },
  },

  {
    /* Feature slices must not reach into each other's internals. Shared code
       belongs in src/core, src/lib or src/components/ui.
       Convention: inside a slice use relative imports ("./components/Foo");
       across slices import only the public barrel ("@/features/battle"), which
       makes any deeper absolute feature specifier a boundary violation. */
    name: "bunnycode/feature-boundaries",
    files: [
      "src/features/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // A feature may also expose `@/features/<name>/server` for
              // server-only code, kept out of the main barrel so `next/cache`
              // and friends never reach the browser bundle. The negation makes
              // that the one permitted deep path.
              group: ["@/features/*/**", "!@/features/*/server"],
              message:
                "Import a feature through its public index (@/features/<name>) or its server entry (@/features/<name>/server), not its internals.",
            },
          ],
        },
      ],
    },
  },

  {
    name: "bunnycode/tests",
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts", "src/mocks/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
