import { QueryClient } from '@tanstack/react-query'

/**
 * The viewer's one query client. Every query reads data already in the page
 * or bundle (ADR 0011), so nothing goes stale and a failure will not mend on
 * a retry.
 */
export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})
