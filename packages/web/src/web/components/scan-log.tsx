import { Empty, Panel, Skeleton } from "./primitives";
import { timeHMS } from "../lib/format";
import { useScanRuns } from "../queries/signals";

export function ScanLog() {
  const runs = useScanRuns(15);

  return (
    <Panel title="Журнал сканера" bodyClassName="p-0">
      {runs.isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (runs.data?.length ?? 0) === 0 ? (
        <Empty text="Сканер ещё не сделал ни одного прохода." />
      ) : (
        <ul className="max-h-[320px] divide-y divide-border/40 overflow-auto font-mono text-[11px]">
          {runs.data?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
              <span className="text-muted-foreground">{timeHMS(r.startedAt)}</span>
              <span className="text-info">проверено {r.scanned}</span>
              <span className={r.signalsFound > 0 ? "text-call" : "text-muted-foreground"}>
                сигналов {r.signalsFound}
              </span>
              {r.errors > 0 && <span className="text-put">ошибок {r.errors}</span>}
              <span className="text-muted-foreground/70">{r.durationMs} мс</span>
              {r.note && (
                <span className="w-full font-sans text-muted-foreground/80">{r.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
