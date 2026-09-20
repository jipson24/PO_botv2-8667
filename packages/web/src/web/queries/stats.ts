import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Дни с сигналами — список для выбора дня. */
export function useStatsDays(limit = 45) {
  return useQuery(orpc.stats.days.queryOptions({ input: { limit }, refetchInterval: 60_000 }));
}

/** Разбор одного киевского дня. */
export function useDayStats(day?: string) {
  return useQuery(
    orpc.stats.day.queryOptions({
      input: { day },
      refetchInterval: 30_000,
    }),
  );
}

/** Шапка вкладки: сегодня / вчера / неделя. */
export function useStatsSummary() {
  return useQuery(orpc.stats.summary.queryOptions({ refetchInterval: 30_000 }));
}

/** Сохранённый ежедневный отчёт. */
export function useDayReport(day?: string) {
  return useQuery(orpc.stats.report.queryOptions({ input: { day }, staleTime: 30_000 }));
}

/** Пересобрать отчёт за выбранный день. */
export function useRebuildReport() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.stats.rebuildReport.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.stats.key() }),
    }),
  );
}
