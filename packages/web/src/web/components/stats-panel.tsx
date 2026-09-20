import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Lightbulb,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chip, Empty, Panel, Skeleton, Stat } from "./primitives";
import { dateShort, expiryLabel, price, timeHMS } from "../lib/format";
import {
  useDayReport,
  useDayStats,
  useRebuildReport,
  useStatsDays,
  useStatsSummary,
} from "../queries/stats";
import type { DayBucket, DayTrade } from "../types/api";

type Cut = "byDirection" | "bySymbol" | "byHour" | "byConfidence" | "byExpiry" | "byTrigger" | "byBias30";

const CUTS: { id: Cut; label: string }[] = [
  { id: "byHour", label: "По часам" },
  { id: "byConfidence", label: "По уверенности" },
  { id: "byDirection", label: "CALL / PUT" },
  { id: "bySymbol", label: "По парам" },
  { id: "byExpiry", label: "По экспирации" },
  { id: "byTrigger", label: "По триггеру 5m" },
  { id: "byBias30", label: "По bias 30m" },
];

const wrTone = (winrate: number, decided: number): "call" | "put" | "gold" | "muted" => {
  if (!decided) return "muted";
  if (winrate >= 80) return "call";
  if (winrate >= 55) return "gold";
  return "put";
};

export function StatsPanel() {
  const summary = useStatsSummary();
  const days = useStatsDays();
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? summary.data?.today;
  const stats = useDayStats(day);
  const report = useDayReport(day);
  const rebuild = useRebuildReport();
  const [cut, setCut] = useState<Cut>("byHour");
  const [onlyLosses, setOnlyLosses] = useState(false);

  const s = stats.data;
  const target = summary.data?.target ?? 90;
  const gap = s ? Number((target - s.tally.winrate).toFixed(1)) : null;

  const trades = useMemo(() => {
    const list = s?.trades ?? [];
    return onlyLosses ? list.filter((t) => t.outcome === "loss") : list;
  }, [s?.trades, onlyLosses]);

  const analysis = report.data?.analysis as
    | {
        worked?: string[];
        failed?: string[];
        proposals?: {
          title: string;
          evidence: string;
          action: string;
          winrateIfApplied: number | null;
          cuts: number;
        }[];
        losses?: { id: number; symbol: string; at: string; causes: string[] }[];
      }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.isLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[86px] w-full rounded-xl" />)
        ) : (
          <>
            <Stat
              label="Винрейт сегодня"
              value={`${summary.data?.todayTally.winrate ?? 0}%`}
              tone={wrTone(
                summary.data?.todayTally.winrate ?? 0,
                summary.data?.todayTally.decided ?? 0,
              )}
              hint={`${summary.data?.todayTally.wins ?? 0} в плюс · ${summary.data?.todayTally.losses ?? 0} в минус`}
            />
            <Stat
              label="Вчера"
              value={`${summary.data?.yesterdayTally.winrate ?? 0}%`}
              tone={wrTone(
                summary.data?.yesterdayTally.winrate ?? 0,
                summary.data?.yesterdayTally.decided ?? 0,
              )}
              hint={`${summary.data?.yesterdayTally.decided ?? 0} закрытых сделок`}
            />
            <Stat
              label="7 дней"
              value={`${summary.data?.weekTally.winrate ?? 0}%`}
              tone={wrTone(
                summary.data?.weekTally.winrate ?? 0,
                summary.data?.weekTally.decided ?? 0,
              )}
              hint={`итог ${summary.data?.weekTally.netPct ?? 0}% ставки на ${summary.data?.weekTally.decided ?? 0} сделках`}
            />
            <Stat
              label="Цель"
              value={`${target}%`}
              tone="info"
              hint={
                summary.data?.reporterRunning
                  ? "разбор в 00:03 по Киеву"
                  : "автоотчёт не запущен"
              }
            />
          </>
        )}
      </div>

      <Panel
        title="Торговый день"
        right={
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            disabled={rebuild.isPending || !day}
            onClick={() => day && rebuild.mutate({ day })}
          >
            <RefreshCw className={cn("size-3", rebuild.isPending && "animate-spin")} />
            {rebuild.isPending ? "Считаю…" : "Пересобрать разбор"}
          </Button>
        }
        bodyClassName="p-3"
      >
        {days.isLoading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : (days.data?.length ?? 0) === 0 ? (
          <Empty
            icon={<CalendarDays className="size-6" />}
            text="Закрытых сделок пока нет. Как только сканер опубликует сигналы и они дойдут до экспирации, здесь появится статистика по киевским суткам."
          />
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.data?.map((d) => {
              const active = d.day === day;
              const decided = d.wins + d.losses;
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setPicked(d.day)}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-call/50 bg-call/10"
                      : "border-border/60 bg-elevated/40 hover:border-border",
                  )}
                >
                  <div className="num text-[12px] font-semibold">{dateShort(d.day)}</div>
                  <div
                    className={cn(
                      "num text-[15px] font-bold leading-tight",
                      decided === 0
                        ? "text-muted-foreground"
                        : d.winrate >= 80
                          ? "text-call"
                          : d.winrate >= 55
                            ? "text-gold"
                            : "text-put",
                    )}
                  >
                    {decided ? `${d.winrate}%` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {d.wins}/{decided || 0}
                    {d.pending ? ` · ${d.pending} ждут` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {stats.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !s || s.tally.trades === 0 ? (
        <Panel title={`День ${day ?? "—"}`}>
          <Empty
            icon={<CalendarDays className="size-6" />}
            text="За этот день сигналов нет."
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Винрейт дня"
              value={`${s.tally.winrate}%`}
              tone={wrTone(s.tally.winrate, s.tally.decided)}
              hint={
                gap != null && gap > 0
                  ? `до цели ${target}% не хватает ${gap} п.п.`
                  : `цель ${target}% выполнена`
              }
            />
            <Stat
              label="Плюс / минус"
              value={
                <span>
                  <span className="text-call">{s.tally.wins}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-put">{s.tally.losses}</span>
                </span>
              }
              hint={`сделок ${s.tally.trades}${s.tally.pending ? ` · ждут ${s.tally.pending}` : ""}${s.tally.unknown ? ` · без данных ${s.tally.unknown}` : ""}`}
            />
            <Stat
              label="Итог"
              value={`${s.tally.netPct > 0 ? "+" : ""}${s.tally.netPct}%`}
              tone={s.tally.netPct > 0 ? "call" : s.tally.netPct < 0 ? "put" : "muted"}
              hint="в процентах от ставки"
            />
            <Stat
              label="Серии"
              value={
                <span>
                  <span className="text-call">{s.bestWinStreak}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-put">{s.worstLossStreak}</span>
                </span>
              }
              hint="подряд в плюс / в минус"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Panel
                title="Разрезы дня"
                right={
                  <select
                    value={cut}
                    onChange={(e) => setCut(e.target.value as Cut)}
                    className="rounded-md border border-border/60 bg-elevated px-2 py-1 text-[11px] text-foreground"
                  >
                    {CUTS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                }
                bodyClassName="p-3 space-y-1.5"
              >
                {s[cut].length === 0 ? (
                  <Empty text="Данных для этого разреза нет." />
                ) : (
                  s[cut].map((b: DayBucket) => <BucketRow key={b.key} bucket={b} />)
                )}
              </Panel>

              <Panel
                title={`Сделки · ${trades.length}`}
                right={
                  <button
                    type="button"
                    onClick={() => setOnlyLosses((v) => !v)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      onlyLosses
                        ? "border-put/50 bg-put/10 text-put"
                        : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    только убытки
                  </button>
                }
                bodyClassName="p-3 space-y-2"
              >
                {trades.length === 0 ? (
                  <Empty text="Нет сделок под этот фильтр." />
                ) : (
                  trades.map((t) => <TradeItem key={t.id} trade={t} />)
                )}
              </Panel>
            </div>

            <div className="space-y-4">
              {(analysis?.proposals?.length ?? 0) > 0 && (
                <Panel title="Что менять" bodyClassName="p-3 space-y-2.5">
                  {analysis?.proposals?.map((p, i) => (
                    <div
                      key={p.title}
                      className="rounded-lg border border-info/25 bg-info/5 px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-info" />
                        <div className="min-w-0 space-y-1">
                          <div className="text-[12px] font-semibold leading-snug">
                            {i + 1}. {p.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{p.evidence}</div>
                          <div className="text-[11px] text-foreground/80">{p.action}</div>
                          {p.winrateIfApplied != null && (
                            <Chip tone={p.winrateIfApplied >= 80 ? "call" : "gold"}>
                              <Target className="size-3" /> стало бы {p.winrateIfApplied}% · −
                              {p.cuts} сделок
                            </Chip>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </Panel>
              )}

              {(analysis?.worked?.length ?? 0) > 0 && (
                <Panel title="Что работало" bodyClassName="p-3">
                  <ul className="space-y-1.5 text-[12px] text-muted-foreground">
                    {analysis?.worked?.map((w) => (
                      <li key={w} className="flex gap-2">
                        <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-call" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {(analysis?.failed?.length ?? 0) > 0 && (
                <Panel title="Что подводило" bodyClassName="p-3">
                  <ul className="space-y-1.5 text-[12px] text-muted-foreground">
                    {analysis?.failed?.map((f) => (
                      <li key={f} className="flex gap-2">
                        <TrendingDown className="mt-0.5 size-3.5 shrink-0 text-put" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {s.faults.length > 0 && (
                <Panel title="Дефекты входа" bodyClassName="p-3 space-y-1.5">
                  {s.faults.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-start justify-between gap-2 border-b border-border/40 pb-1.5 text-[12px] last:border-0 last:pb-0"
                    >
                      <span className="flex gap-2 text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" />
                        {f.label}
                      </span>
                      <span className="num shrink-0 font-semibold">{f.count}</span>
                    </div>
                  ))}
                </Panel>
              )}

              {s.factors.length > 0 && (
                <Panel title="Факторы входа" bodyClassName="p-3 space-y-1.5">
                  {s.factors.slice(0, 12).map((f) => (
                    <div
                      key={f.label}
                      className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 text-[12px] last:border-0 last:pb-0"
                    >
                      <span className="truncate text-muted-foreground" title={f.label}>
                        {f.label}
                      </span>
                      <span
                        className={cn(
                          "num shrink-0 font-semibold",
                          f.decided === 0
                            ? "text-muted-foreground"
                            : f.winrate >= 80
                              ? "text-call"
                              : f.winrate >= 55
                                ? "text-gold"
                                : "text-put",
                        )}
                      >
                        {f.decided ? `${f.winrate}%` : "—"}{" "}
                        <span className="text-[10px] text-muted-foreground">({f.decided})</span>
                      </span>
                    </div>
                  ))}
                </Panel>
              )}

              {report.data?.summary && (
                <Panel title="Текст отчёта" bodyClassName="p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-[12px] text-muted-foreground hover:text-foreground">
                      <span>Полный разбор дня</span>
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <pre className="max-h-96 overflow-auto border-t border-border/60 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {report.data.summary}
                    </pre>
                  </details>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BucketRow({ bucket }: { bucket: DayBucket }) {
  const tone = wrTone(bucket.winrate, bucket.decided);
  return (
    <div className="space-y-1 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="truncate font-medium" title={bucket.label}>
          {bucket.label}
        </span>
        <span className="num shrink-0 text-muted-foreground">
          <span
            className={cn(
              "font-semibold",
              tone === "call" && "text-call",
              tone === "put" && "text-put",
              tone === "gold" && "text-gold",
            )}
          >
            {bucket.decided ? `${bucket.winrate}%` : "—"}
          </span>{" "}
          · {bucket.wins}/{bucket.decided}
          {bucket.pending ? ` · ${bucket.pending} ждут` : ""}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "call" ? "bg-call" : tone === "put" ? "bg-put" : "bg-gold",
          )}
          style={{ width: `${Math.min(100, Math.max(0, bucket.winrate))}%` }}
        />
      </div>
    </div>
  );
}

function TradeItem({ trade }: { trade: DayTrade }) {
  const win = trade.outcome === "win";
  const loss = trade.outcome === "loss";
  const isCall = trade.direction === "call";
  return (
    <div
      className={cn(
        "rounded-lg border bg-elevated/40 px-2.5 py-2",
        win ? "border-call/30" : loss ? "border-put/30" : "border-border/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span className="num font-semibold">
          {win ? "🟢" : loss ? "🔴" : trade.outcome === "draw" ? "⚪" : "⏳"} {timeHMS(trade.entryAt)}
        </span>
        <span className="num font-semibold">{trade.symbol}</span>
        <Chip tone={isCall ? "call" : "put"}>{isCall ? "CALL ↑" : "PUT ↓"}</Chip>
        <Chip tone="gold">{trade.confidence}%</Chip>
        <Chip tone="info">{expiryLabel(trade.expirySeconds)}</Chip>
        <span className="num ml-auto text-muted-foreground">
          {price(trade.price)}
          {trade.resultPrice != null ? ` → ${price(trade.resultPrice)}` : ""}
          {trade.moveAtr != null ? ` · ${trade.moveAtr} ATR` : ""}
        </span>
      </div>
      <div className="mt-1 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
        <span className="truncate" title={trade.biasH30}>
          30m: {trade.biasH30}
        </span>
        <span className="truncate" title={trade.biasM15}>
          15m: {trade.biasM15}
        </span>
        <span className="truncate" title={trade.triggerM5}>
          5m: {trade.triggerM5}
        </span>
      </div>
      {trade.faults.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border/40 pt-1.5 text-[11px] text-gold">
          {trade.faults.map((f) => (
            <li key={f} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {!trade.hasSnapshot && (
        <div className="mt-1 text-[10px] text-muted-foreground/70">
          слепка входа нет — сигнал снят до появления архива
        </div>
      )}
    </div>
  );
}
