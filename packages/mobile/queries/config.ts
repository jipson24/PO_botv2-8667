import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/api";

export function useConfig() {
  return useQuery(orpc.config.get.queryOptions({ refetchInterval: 30_000 }));
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.config.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.config.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.signals.key() });
      },
    }),
  );
}
