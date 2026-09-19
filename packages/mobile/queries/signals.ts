import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/api";

export function useSignals(
  input: { limit?: number; direction?: "call" | "put"; symbol?: string } = {},
) {
  return useQuery(
    orpc.signals.list.queryOptions({
      input: { limit: input.limit ?? 30, direction: input.direction, symbol: input.symbol },
      refetchInterval: 15_000,
    }),
  );
}

export function useSignal(id: number) {
  return useQuery(orpc.signals.get.queryOptions({ input: { id }, staleTime: 30_000 }));
}

export function useOverview() {
  return useQuery(orpc.signals.overview.queryOptions({ refetchInterval: 10_000 }));
}

export function useScanRuns(limit = 12) {
  return useQuery(
    orpc.signals.runs.queryOptions({ input: { limit }, refetchInterval: 15_000 }),
  );
}

export function useScanNow() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.signals.scanNow.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.signals.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.pairs.key() });
      },
    }),
  );
}

export function useResendSignal() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.signals.resend.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.signals.key() }),
    }),
  );
}
