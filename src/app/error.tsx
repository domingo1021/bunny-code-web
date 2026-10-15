"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * The original had none: an unhandled error anywhere in a Vue view left the
 * screen half-rendered with no way back, and the only report was in the
 * console.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-ink-muted">
        This screen hit an error it could not recover from on its own.
      </p>
      {error.message !== "" && (
        <p className="border-edge bg-surface text-ink-muted max-w-full overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs">
          {error.message}
        </p>
      )}
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
