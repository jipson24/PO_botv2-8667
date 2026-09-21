import { useMemo, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chip, Empty, Panel, Skeleton } from "./primitives";
import { agoLabel, expiryLabel, timeHMS } from "../lib/format";
import { usePairs, useSyncPairs, useTogglePair, useAnalyzePair } from "../queries/pairs";
import type { PairAnalysis } from "../types/api";

const FEED_LABEL: Record<string, string> = {
  ok: "фид ок",
  public_feed: "публичный фид",
  needs_po_feed: "нужен ssid PO",
  unknown: "не проверен",
};

export function PairsTable() {
  const pairs = usePairs();
  const sync = useSyncPairs();
  const toggle = useTogglePair();
  const analyze = useAnalyzePair();
  const [query, setQuery] = useState("");
  const [onlyRange, setOnlyRange] = useState(true);
  const [probe, setProbe] = useState<PairAnalysis | null>(null);

  const rows = useMemo(() => {
    const list = pairs.data ?? [];
    return list.filter((p) => {
      if (onlyRange && !p.inRange) return false;
      if (!query) return true;
      const q = query.toUpperCase();
      return p.symbol.toUpperCase().includes(q) || p.name.toUpperCase().includes(q);
    });
  }, [pairs.data, onlyRange, query]);

  return (
    <Panel
      title={`Пары · ${rows.length}`}
      right={
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Только пары с payout 82–92%"
              checked={onlyRange}
              onChange={(e) => setOnlyRange(e.target.checked)}
              className="size-3.5 accent-[var(--call)]"
            />
            только 82–92%
          </label>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            disabled={sync.isPending}
            onClick={() => sync.mutate({})}
          >
            <RefreshCw className={cn("size-3", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Синхронизация…" : "Обновить payout"}
          </Button>
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          aria-label="Поиск пары"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск пары…"
          className="num w-full bg-transparent text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
      </div>

      {pairs.isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty
          text="Пар нет. Нажмите «Обновить payout» — список активов подтянется из Pocket Option."
          icon={<Activity className="size-6" />}
        />
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
              <tr className="border-b border-border/70">
                <th className="px-4 py-2 text-left font-semibold">Пара</th>
                <th className="px-2 py-2 text-right font-semibold">Payout</th>
                <th className="px-2 py-2 text-left font-semibold">Фид</th>
                <th className="px-2 py-2 text-left font-semibold">Свечи</th>
                <th className="px-2 py-2 text-center font-semibold">Скан</th>
                <th className="px-4 py-2 text-right font-semibold"><span className="sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.symbol} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2">
                    <div className="num font-semibold">{p.symbol}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.name}
                      {p.isOtc ? " · OTC" : ""}
                      {p.excluded ? (
                        <span className="text-put"> · не сканируем</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={cn(
                        "num font-semibold",
                        p.inRange ? "text-gold" : "text-muted-foreground",
                      )}
                    >
                      {p.payout}%
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <Chip tone={p.feedStatus === "needs_po_feed" ? "put" : p.feedStatus === "unknown" ? "muted" : "call"}>
                      {FEED_LABEL[p.feedStatus] ?? p.feedStatus}
                    </Chip>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-muted-foreground">
                    {p.lastCandleAt ? agoLabel(p.lastCandleAt) : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Сканировать ${p.symbol}`}
                      checked={p.isActive}
                      onChange={(e) => toggle.mutate({ symbol: p.symbol, isActive: e.target.checked })}
                      className="size-3.5 accent-[var(--call)]"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      disabled={analyze.isPending}
                      onClick={() =>
                        analyze.mutate({ symbol: p.symbol }, { onSuccess: (data) => setProbe(data) })
                      }
                    >
                      {analyze.isPending && analyze.variables?.symbol === p.symbol
                        ? "Анализ…"
                        : "Анализ"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {probe && <ProbeResult probe={probe} onClose={() => setProbe(null)} />}
    </Panel>
  );
}

function ProbeResult({ probe, onClose }: { probe: PairAnalysis; onClose: () => void }) {
  return (
    <div className="border-t border-border/70 bg-elevated/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="num text-sm font-semibold">{probe.symbol}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      {probe.ok ? (
        <div className="mt-2 space-y-2 text-[12px]">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={probe.analysis.direction === "call" ? "call" : probe.analysis.direction === "put" ? "put" : "muted"}>
              {probe.analysis.direction ? probe.analysis.direction.toUpperCase() : "нет направления"}
            </Chip>
            <Chip tone="gold">уверенность {probe.analysis.confidence}%</Chip>
            <Chip tone="info">{expiryLabel(probe.analysis.expirySeconds)}</Chip>
            <Chip>{probe.source}</Chip>
            <Chip>последняя свеча {timeHMS(probe.lastCandleAt * 1000)}</Chip>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <Info label="30m" value={probe.analysis.biasH30} />
            <Info label="15m" value={probe.analysis.biasM15} />
            <Info label="5m" value={probe.analysis.triggerM5} />
          </div>
          {probe.analysis.reasons.length > 0 && (
            <ul className="space-y-1 text-muted-foreground">
              {probe.analysis.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          )}
          {probe.analysis.blockers.length > 0 && (
            <div className="text-put">
              Блокеры: {probe.analysis.blockers.join(" · ")}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-put">{probe.error}</p>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate">{value}</div>
    </div>
  );
}
