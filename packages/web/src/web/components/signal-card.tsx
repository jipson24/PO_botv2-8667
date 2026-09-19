import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, Send, Target, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chip, ConfidenceBar } from "./primitives";
import { countdown, expiryLabel, price, timeHMS, toArray } from "../lib/format";
import type { Signal } from "../types/api";

function useTick(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function SignalCard({
  signal,
  onResend,
  resending,
}: {
  signal: Signal;
  onResend?: (id: number) => void;
  resending?: boolean;
}) {
  useTick();
  const isCall = signal.direction === "call";
  const left = countdown(signal.expiresAt);
  const live = left !== "истёк";
  const reasons = toArray(signal.reasons);

  return (
    <article
      className={cn(
        "rise relative overflow-hidden rounded-xl border bg-card/90 p-4",
        isCall ? "border-call/25" : "border-put/25",
        live && (isCall ? "glow-call" : "glow-put"),
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px",
          isCall ? "bg-call/60" : "bg-put/60",
        )}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg border",
              isCall ? "border-call/40 bg-call/10 text-call" : "border-put/40 bg-put/10 text-put",
            )}
          >
            {isCall ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
          </div>
          <div>
            <div className="num text-base font-bold leading-tight">{signal.symbol}</div>
            <div className="text-[11px] text-muted-foreground">{signal.assetName}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={isCall ? "call" : "put"}>{isCall ? "CALL ↑" : "PUT ↓"}</Chip>
          <Chip tone="gold">
            <Target className="size-3" /> {signal.confidence}%
          </Chip>
          <Chip tone="info">
            <Timer className="size-3" /> {expiryLabel(signal.expirySeconds)}
          </Chip>
          {signal.payout > 0 && (
            <Chip tone={signal.lowPayout ? "put" : undefined}>
              payout {signal.payout}%{signal.lowPayout ? " · низкий" : ""}
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Вход" value={timeHMS(signal.entryAt)} />
        <Field label="Цена" value={price(signal.price)} />
        <Field label="Экспирация" value={timeHMS(signal.expiresAt)} />
        <Field
          label={live ? "Осталось" : "Статус"}
          value={live ? left : signal.outcome === "pending" ? "закрыт" : signal.outcome}
          tone={live ? (isCall ? "call" : "put") : "muted"}
        />
      </div>

      <div className="mt-3">
        <ConfidenceBar value={signal.confidence} tone={isCall ? "call" : "put"} />
      </div>

      <div className="mt-3 grid gap-1.5 text-[11px] sm:grid-cols-3">
        <Tf label="30m bias" value={signal.biasH30} />
        <Tf label="15m" value={signal.biasM15} />
        <Tf label="5m триггер" value={signal.triggerM5} />
      </div>

      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/70 pt-3 text-[12px] text-muted-foreground">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className={isCall ? "text-call" : "text-put"}>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {timeHMS(signal.createdAt)}
          {signal.sentToTelegram ? " · отправлен в Telegram" : " · не отправлен"}
        </span>
        {onResend && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px]"
            disabled={resending}
            onClick={() => onResend(signal.id)}
          >
            <Send className="size-3" />
            {resending ? "Отправка…" : "В Telegram"}
          </Button>
        )}
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "call" | "put";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-elevated/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-0.5 text-sm font-semibold",
          tone === "call" && "text-call",
          tone === "put" && "text-put",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Tf({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-border/60 bg-elevated/40 px-2.5 py-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-foreground/90">{value}</span>
    </div>
  );
}
