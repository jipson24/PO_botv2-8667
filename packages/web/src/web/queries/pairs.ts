import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePairs() {
  return useQuery(orpc.pairs.list.queryOptions({ refetchInterval: 30_000 }));
}

export function useSyncPairs() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.pairs.sync.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.pairs.key() }),
    }),
  );
}

export function useTogglePair() {
  const queryClient = useQueryClient();
  const listKey = orpc.pairs.list.queryOptions().queryKey;
  return useMutation(
    orpc.pairs.toggle.mutationOptions({
      onMutate: async ({ symbol, isActive }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const prev = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (old) =>
          Array.isArray(old)
            ? old.map((p) => (p.symbol === symbol ? { ...p, isActive } : p))
            : old,
        );
        return { prev };
      },
      onError: (_error, _input, ctx) => queryClient.setQueryData(listKey, ctx?.prev),
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  );
}

export function useAnalyzePair() {
  return useMutation(orpc.pairs.analyze.mutationOptions());
}
