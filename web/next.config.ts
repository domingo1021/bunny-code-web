import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the self-contained server (`.next/standalone`).
  // Opt-in, so `next start` keeps working for local runs and Playwright.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const }
    : {}),
  outputFileTracingRoot: __dirname,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Pinned to this package: Turbopack otherwise infers the root from the
    // nearest lockfile, and a stray one outside the repository made the build
    // warn and resolve from the wrong place.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
