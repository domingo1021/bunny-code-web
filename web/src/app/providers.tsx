"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useRestoreSession } from "@/features/auth";
import { RealtimeProvider } from "@/features/battle";
import { ApiError } from "@/lib/api-client";
import { USING_MOCK_API } from "@/lib/env";

/**
 * Everything the client tree needs, mounted once.
 *
 * `ssr: false` is required rather than stylistic: MSW's exports map resolves
 * `msw/browser` to `null` under the `node` condition, so the module is absent
 * from the SSR graph. Gating the dynamic component behind `USING_MOCK_API`
 * means that when a real backend is configured the chunk is never requested.
 */
const MockApiGate = dynamic(
  () => import("./mock-api-gate").then((m) => m.MockApiGate),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  const tree = (
    <QueryClientProvider client={queryClient}>
      <SessionGate>
        <RealtimeProvider>{children}</RealtimeProvider>
      </SessionGate>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        toastOptions={{ className: "border-edge bg-surface-raised text-ink" }}
      />
    </QueryClientProvider>
  );

  return USING_MOCK_API ? <MockApiGate>{tree}</MockApiGate> : tree;
}

/** Verifies a token restored from storage, once, inside the query provider. */
function SessionGate({ children }: { children: ReactNode }) {
  useRestoreSession();
  return <>{children}</>;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Project and battle listings change rarely within a visit; this keeps
        // navigating back and forth from refetching everything.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a 4xx cannot succeed and only delays the error the user
          // needs to see.
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
