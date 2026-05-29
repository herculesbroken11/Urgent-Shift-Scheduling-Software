/**
 * Data adapter utilities.
 *
 * Provides `useAdaptedQuery` and `useAdaptedMutation` so that hooks never
 * contain inline `isDemoMode` branching.  Each hook supplies a **demo
 * strategy** and a **production strategy**; the adapter picks the right one
 * at runtime based on `useAuth().isDemoMode`.
 *
 * Convention:
 *   • demoFn / demoMutationFn  – synchronous (or async) functions that
 *     operate on the in-memory DemoDataContext.
 *   • queryFn / mutationFn     – async functions that hit Supabase.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  useAdaptedQuery                                                    */
/* ------------------------------------------------------------------ */

export interface AdaptedQueryOptions<T> {
  /** React-Query cache key */
  queryKey: unknown[];
  /** Production data fetcher (hits Supabase) */
  queryFn: () => Promise<T>;
  /** Demo data resolver (reads DemoDataContext state) */
  demoFn: () => T;
  /** Extra enabled condition (ANDed with !isDemoMode for production) */
  enabled?: boolean;
  /** How long data is considered fresh (ms). Reduces refetch noise for slow-changing data. */
  staleTime?: number;
}

/**
 * Drop-in replacement for `useQuery` that transparently switches between
 * demo in-memory data and production Supabase queries.
 */
export function useAdaptedQuery<T>(opts: AdaptedQueryOptions<T>): UseQueryResult<T> {
  const { isDemoMode } = useAuth();
  const externalEnabled = opts.enabled ?? true;

  const query = useQuery<T>({
    queryKey: opts.queryKey,
    queryFn: opts.queryFn,
    enabled: !isDemoMode && externalEnabled,
    staleTime: opts.staleTime,
  });

  if (isDemoMode) {
    // Return a query-shaped object with demo data
    return {
      ...query,
      data: opts.demoFn(),
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
      status: "success",
    } as unknown as UseQueryResult<T>;
  }

  return query;
}

/* ------------------------------------------------------------------ */
/*  useAdaptedMutation                                                 */
/* ------------------------------------------------------------------ */

export interface AdaptedMutationOptions<TInput, TOutput = unknown> {
  /** Production mutation (hits Supabase) */
  mutationFn: (input: TInput) => Promise<TOutput>;
  /** Demo mutation (updates DemoDataContext) — may return synchronously */
  demoFn: (input: TInput) => TOutput | Promise<TOutput>;
  /** Query keys to invalidate on success (production only) */
  invalidateKeys?: unknown[][];
  /** Toast message shown on success */
  successMessage?: string;
  /** Custom onSuccess callback (runs in both modes) */
  onSuccess?: (data: TOutput) => void;
  /** Toast title for errors (default: "Error") */
  errorTitle?: string;
  /** Use sonner toast.error instead of shadcn toast */
  useSonner?: boolean;
}

/**
 * Drop-in replacement for `useMutation` that transparently switches between
 * demo in-memory updates and production Supabase mutations.
 */
export function useAdaptedMutation<TInput, TOutput = unknown>(
  opts: AdaptedMutationOptions<TInput, TOutput>,
): UseMutationResult<TOutput, Error, TInput> {
  const { isDemoMode } = useAuth();
  const qc = useQueryClient();

  return useMutation<TOutput, Error, TInput>({
    mutationFn: async (input: TInput) => {
      if (isDemoMode) {
        return opts.demoFn(input);
      }
      return opts.mutationFn(input);
    },
    onSuccess: async (data) => {
      if (!isDemoMode && opts.invalidateKeys) {
        // Await invalidations so per-call onSuccess (e.g. closing a dialog)
        // runs AFTER active queries have refetched. Without this, the UI may
        // still show stale data when the dialog closes (e.g. status appears
        // unchanged until the user navigates away and back).
        await Promise.all(
          opts.invalidateKeys.map((key) =>
            qc.invalidateQueries({ queryKey: key, refetchType: "active" }),
          ),
        );
      }
      if (opts.successMessage) {
        toast.success(opts.successMessage);
      }
      opts.onSuccess?.(data);
    },
    onError: (e: Error) => {
      toast.error(`${opts.errorTitle ?? "Error"}: ${e.message}`);
    },
  });
}
