import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";

/**
 * Rendering helpers for component and hook tests.
 *
 * A fresh `QueryClient` per test, with retries off: a test that asserts an
 * error path should not wait out two retry attempts, and a client shared
 * between tests leaks one test's cache into the next.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function Providers({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  return (
    <QueryClientProvider client={client ?? createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

/** `render`, wrapped in the providers a client component expects. */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { client?: QueryClient },
) {
  const client = options?.client ?? createTestQueryClient();
  return {
    client,
    ...render(ui, {
      wrapper: ({ children }) => (
        <Providers client={client}>{children}</Providers>
      ),
      ...options,
    }),
  };
}
