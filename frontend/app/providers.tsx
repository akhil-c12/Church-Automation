"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Tooltip } from "radix-ui";
import { ApiError, setUnauthorizedHandler } from "@/lib/api";

function goToLogin() {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
  const next = window.location.pathname + window.location.search;
  // Full navigation on purpose: it discards every cached query from the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}
setUnauthorizedHandler(goToLogin);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // Backend already retries n8n reads; only retry here on network blips.
            retry: (count, err) => err instanceof ApiError && err.status === 0 && count < 2,
          },
        },
        queryCache: new QueryCache(),
        mutationCache: new MutationCache(),
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delayDuration={250}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: "!bg-card !text-ink !border-line !shadow-lg !rounded-xl !font-sans",
              description: "!text-ink-3",
              actionButton: "!bg-primary !text-primary-ink",
            },
          }}
        />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
