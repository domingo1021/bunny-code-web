"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Starts the mock API and holds the tree back until it is serving.
 *
 * **Must only ever be loaded with `next/dynamic({ ssr: false })`.** MSW's
 * package exports map `./browser` to `null` under the `node` condition, so the
 * module does not exist in the SSR graph at all and a static import here fails
 * the build. Keeping it out of that graph is also correct on its own terms: a
 * service worker is meaningless during a server render.
 *
 * Gating on `ready` rather than firing and forgetting matters because the first
 * query would otherwise race the worker's registration, reach the real network
 * and 404.
 */
export function MockApiGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"starting" | "ready" | "failed">(
    "starting",
  );

  useEffect(() => {
    let active = true;

    void import("@/mocks/browser")
      .then(({ worker }) =>
        worker.start({
          // Anything the handlers do not cover is a real request (fonts, the
          // Next.js asset graph) and must pass through untouched.
          onUnhandledFrame: "bypass",
          quiet: true,
          serviceWorker: { url: "/mockServiceWorker.js" },
        }),
      )
      .then(() => {
        if (active) setState("ready");
      })
      .catch((error: unknown) => {
        console.error("[mock api] failed to start", error);
        if (active) setState("failed");
      });

    return () => {
      active = false;
    };
  }, []);

  if (state === "starting") {
    return (
      <div className="bg-canvas min-h-dvh" aria-busy="true">
        <span className="sr-only" role="status">
          Starting the demo API
        </span>
      </div>
    );
  }

  /*
   * Without the worker there is no API, so every screen would be an error.
   * Saying so once, clearly, beats a blank page and a console full of 404s.
   */
  if (state === "failed") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">The demo API could not start</h1>
        <p className="text-ink-muted text-sm">
          This demo serves its own API from a service worker, which this browser
          refused to register. Service workers need a secure context, so check
          that the page is on HTTPS (or localhost) and that site data is not
          blocked, then reload.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
