/**
 * Статистика торгового дня и разбор причин.
 *
 * Один источник цифр для трёх потребителей: вкладка «Статистика», ежедневный
 * отчёт и Telegram. Считается по киевским суткам (`signals.trade_day`), потому
 * что торговая сессия у пользователя киевская, а не UTC.
 *
 * Все выводы строятся на слепках входа (`signals.snapshot`): у сигналов, снятых
 * до появления архива, слепка нет — такие строки просто не попадают в разрезы по
 * факторам, но в общий винрейт входят.
 */

import { asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { kyivDay, kyivHour } from "../lib/day";
import type { Factor } from "../strategy/analyze";
import type { EntrySnapshot } from "../strategy/snapshot";
import { profitPct } from "./outcomes";

type SignalRow = typeof schema.signals.$inferSelect;

/** Цель, к которой подтягиваем движок. */
export const TARGET_WINRATE = 90;

export interface Tally {
  trades: number;
  wins: number;
  losses: number;
  draws: number;
  pending: number;
  unknown: number;
  /** Решённые сделки: win + loss. По ним считается винрейт. */
  decided: number;
  winrate: number;
  /** Итог в процентах от ставки: +payout за плюс, −100 за минус. */
  netPct: number;
}

export interface Bucket extends Tally {
  key: string;
  label: string;
}

export interface TradeRow {
  id: number;
  symbol: string;
  assetName: string;
  direction: string;
  confidence: number;
  payout: number;
  lowPayout: boolean;
  expirySeconds: number;
  entryAt: Date;
  expiresAt: Date;
  price: number;
  resultPrice: number | null;
  outcome: string;
  resolveNote: string | null;
  profitPct: number;
  /** Ход цены от входа к экспирации в пунктах и в ATR входа. */
  moveAbs: number | null;
  moveAtr: number | null;
  biasH30: string;
  biasM15: string;
  triggerM5: string;
  reasons: string[];
  kyivHour: number;
  margin: number | null;
  atrPct: number | null;
  rsi5: number | null;
  levelAheadAtr: number | null;
  /** Причины проигрыша, найденные по слепку входа. */
  faults: string[];
  hasSnapshot: boolean;
}

export interface FactorStat extends Tally {
  label: string;
  /** Средний вес фактора в голосовании. */
  weight: number;
  /** Сколько раз фактор голосовал против направления сделки. */
  against: number;
  againstLosses: number;
}

export interface DayStats {
  day: string;
  tally: Tally;
  bestWinStreak: number;
  worstLossStreak: number;
  byDirection: Bucket[];
  bySymbol: Bucket[];
  byHour: Bucket[];
  byConfidence: Bucket[];
  byExpiry: Bucket[];
  byTrigger: Bucket[];
  byBias30: Bucket[];
  factors: FactorStat[];
  faults: { label: string; count: number }[];
  trades: TradeRow[];
  snapshots: number;
}

const empty = (): Tally => ({
  trades: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  pending: 0,
  unknown: 0,
  decided: 0,
  winrate: 0,
  netPct: 0,
});

function add(t: Tally, row: { outcome: string; payout: number }): Tally {
  t.trades += 1;
  if (row.outcome === "win") t.wins += 1;
  else if (row.outcome === "loss") t.losses += 1;
  else if (row.outcome === "draw") t.draws += 1;
  else if (row.outcome === "pending") t.pending += 1;
  else t.unknown += 1;
  t.netPct = Number((t.netPct + profitPct(row.outcome, row.payout)).toFixed(2));
  t.decided = t.wins + t.losses;
  t.winrate = t.decided ? Number(((t.wins / t.decided) * 100).toFixed(1)) : 0;
  return t;
}

function group<T>(
  rows: T[],
  keyOf: (row: T) => { key: string; label: string } | null,
  pick: (row: T) => { outcome: string; payout: number },
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const id = keyOf(row);
    if (!id) continue;
    const bucket = map.get(id.key) ?? { ...empty(), key: id.key, label: id.label };
    add(bucket, pick(row));
    map.set(id.key, bucket);
  }
  return [...map.values()].sort((a, b) => b.trades - a.trades || a.key.localeCompare(b.key));
}

function confidenceBucket(confidence: number): { key: string; label: string } {
  const floor = Math.min(95, Math.max(50, Math.floor(confidence / 5) * 5));
  return { key: String(floor).padStart(2, "0"), label: `${floor}–${floor + 4}%` };
}

function expiryLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} мин` : `${seconds} сек`;
}

function asSnapshot(value: unknown): EntrySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snap = value as Partial<EntrySnapshot>;
  return snap.decision && snap.indicators ? (snap as EntrySnapshot) : null;
}

function asFactors(value: unknown): Factor[] {
  return Array.isArray(value) ? (value as Factor[]) : [];
}

/**
 * Причины, по которым сделка была слабой — считаются одинаково для плюса и
 * минуса, чтобы в отчёте было видно, какая из них реально ведёт к убытку, а
 * какая безобидна.
 */
function findFaults(row: SignalRow, snap: EntrySnapshot | null): string[] {
  const out: string[] = [];
  const dir = row.direction;

  if (row.lowPayout) out.push("payout вне целевого диапазона");

  if (!snap) return out;
  const { decision, indicators, structure, levelAhead } = snap;

  if (decision.margin != null && decision.margin < 0.15) out.push("слабый перевес голосов (<15%)");
  if (structure.m30 && structure.m30.bias === "neutral") out.push("30m без направления");
  if (
    structure.m30 &&
    ((dir === "call" && structure.m30.bias === "bearish") ||
      (dir === "put" && structure.m30.bias === "bullish"))
  ) {
    out.push("вход против 30m тренда");
  }
  if (
    structure.m30 &&
    ((dir === "call" && structure.m30.zone === "premium") ||
      (dir === "put" && structure.m30.zone === "discount"))
  ) {
    out.push(dir === "call" ? "покупка в дорогой зоне (premium)" : "продажа в дешёвой зоне (discount)");
  }
  if (levelAhead && levelAhead.distanceAtr <= 0.5) out.push("уровень против входа ближе 0.5 ATR");
  if (indicators.rsi5 != null) {
    if (dir === "call" && indicators.rsi5 >= 70) out.push("RSI в перекупленности");
    if (dir === "put" && indicators.rsi5 <= 30) out.push("RSI в перепроданности");
  }
  if (indicators.macd5Hist != null) {
    if (dir === "call" && indicators.macd5Hist < 0) out.push("MACD 5m против входа");
    if (dir === "put" && indicators.macd5Hist > 0) out.push("MACD 5m против входа");
  }
  if (indicators.atrPct > 0 && indicators.atrPct < 0.03) out.push("волатильность ниже шума (ATR<0.03%)");
  if (indicators.atrPct > 0.2) out.push("экспирация коротка для такой волатильности");

  const factors = asFactors(row.factors ?? snap.factors);
  const forWeight = factors
    .filter((f) => f.direction === dir)
    .reduce((sum, f) => sum + f.weight, 0);
  const againstWeight = factors
    .filter((f) => f.direction !== dir && f.direction !== "neutral")
    .reduce((sum, f) => sum + f.weight, 0);
  if (forWeight > 0 && againstWeight / forWeight > 0.6) out.push("много контрфакторов в голосовании");

  const hour = snap.kyivHour ?? kyivHour(row.entryAt);
  if (hour >= 0 && hour < 7) out.push("тонкий рынок (ночь по Киеву)");

  return out;
}

function toTrade(row: SignalRow): TradeRow {
  const snap = asSnapshot(row.snapshot);
  const moveAbs =
    row.resultPrice != null ? Number((row.resultPrice - row.price).toFixed(6)) : null;
  const atrAbs = snap?.indicators.atrAbs ?? null;
  return {
    id: row.id,
    symbol: row.symbol,
    assetName: row.assetName,
    direction: row.direction,
    confidence: row.confidence,
    payout: row.payout,
    lowPayout: row.lowPayout,
    expirySeconds: row.expirySeconds,
    entryAt: row.entryAt,
    expiresAt: row.expiresAt,
    price: row.price,
    resultPrice: row.resultPrice,
    outcome: row.outcome,
    resolveNote: row.resolveNote,
    profitPct: profitPct(row.outcome, row.payout),
    moveAbs,
    moveAtr:
      moveAbs != null && atrAbs ? Number((moveAbs / atrAbs).toFixed(2)) : null,
    biasH30: row.biasH30,
    biasM15: row.biasM15,
    triggerM5: row.triggerM5,
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    kyivHour: snap?.kyivHour ?? kyivHour(row.entryAt),
    margin: snap?.decision.margin ?? null,
    atrPct: snap?.indicators.atrPct ?? null,
    rsi5: snap?.indicators.rsi5 ?? null,
    levelAheadAtr: snap?.levelAhead?.distanceAtr ?? null,
    faults: findFaults(row, snap),
    hasSnapshot: snap !== null,
  };
}

function streaks(trades: TradeRow[]): { best: number; worst: number } {
  let best = 0;
  let worst = 0;
  let win = 0;
  let loss = 0;
  for (const t of trades) {
    if (t.outcome === "win") {
      win += 1;
      loss = 0;
      best = Math.max(best, win);
    } else if (t.outcome === "loss") {
      loss += 1;
      win = 0;
      worst = Math.max(worst, loss);
    }
  }
  return { best, worst };
}

/** Разрез по факторам голосования: какие реально предсказывают плюс. */
function factorStats(rows: SignalRow[]): FactorStat[] {
  const map = new Map<string, FactorStat & { weightSum: number }>();
  for (const row of rows) {
    const snap = asSnapshot(row.snapshot);
    const factors = asFactors(row.factors ?? snap?.factors);
    if (!factors.length) continue;
    for (const factor of factors) {
      if (factor.direction === "neutral") continue;
      const entry =
        map.get(factor.label) ??
        ({
          ...empty(),
          label: factor.label,
          weight: 0,
          weightSum: 0,
          against: 0,
          againstLosses: 0,
        } as FactorStat & { weightSum: number });
      if (factor.direction === row.direction) {
        add(entry, row);
        entry.weightSum += factor.weight;
      } else {
        entry.against += 1;
        if (row.outcome === "loss") entry.againstLosses += 1;
      }
      map.set(factor.label, entry);
    }
  }
  return [...map.values()]
    .map(({ weightSum, ...rest }) => ({
      ...rest,
      weight: rest.trades ? Number((weightSum / rest.trades).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.trades - a.trades);
}

/** Сигналы одного киевского дня, по времени входа. */
export async function daySignals(day: string): Promise<SignalRow[]> {
  return db
    .select()
    .from(schema.signals)
    .where(eq(schema.signals.tradeDay, day))
    .orderBy(asc(schema.signals.entryAt), asc(schema.signals.id));
}

export async function dayStats(day: string): Promise<DayStats> {
  const rows = await daySignals(day);
  const trades = rows.map(toTrade);

  const tally = rows.reduce((acc, row) => add(acc, row), empty());
  const { best, worst } = streaks(trades);

  const faultCount = new Map<string, number>();
  for (const trade of trades) {
    if (trade.outcome !== "loss") continue;
    for (const fault of trade.faults) faultCount.set(fault, (faultCount.get(fault) ?? 0) + 1);
  }

  return {
    day,
    tally,
    bestWinStreak: best,
    worstLossStreak: worst,
    byDirection: group(
      rows,
      (r) => ({ key: r.direction, label: r.direction === "call" ? "CALL ↑" : "PUT ↓" }),
      (r) => r,
    ),
    bySymbol: group(rows, (r) => ({ key: r.symbol, label: r.assetName }), (r) => r),
    byHour: group(
      rows,
      (r) => {
        const hour = kyivHour(r.entryAt);
        return { key: String(hour).padStart(2, "0"), label: `${String(hour).padStart(2, "0")}:00` };
      },
      (r) => r,
    ).sort((a, b) => a.key.localeCompare(b.key)),
    byConfidence: group(rows, (r) => confidenceBucket(r.confidence), (r) => r).sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
    byExpiry: group(
      rows,
      (r) => ({ key: String(r.expirySeconds).padStart(4, "0"), label: expiryLabel(r.expirySeconds) }),
      (r) => r,
    ).sort((a, b) => a.key.localeCompare(b.key)),
    byTrigger: group(rows, (r) => ({ key: r.triggerM5, label: r.triggerM5 }), (r) => r),
    byBias30: group(rows, (r) => ({ key: r.biasH30, label: r.biasH30 }), (r) => r),
    factors: factorStats(rows),
    faults: [...faultCount.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    trades,
    snapshots: trades.filter((t) => t.hasSnapshot).length,
  };
}

export interface DaySummary {
  day: string;
  trades: number;
  wins: number;
  losses: number;
  pending: number;
  winrate: number;
  netPct: number;
}

/** Дни, по которым есть сигналы — для выбора дня в дашборде. */
export async function availableDays(limit = 60): Promise<DaySummary[]> {
  const rows = await db
    .select({
      day: schema.signals.tradeDay,
      trades: sql<number>`count(*)`,
      wins: sql<number>`sum(case when ${schema.signals.outcome} = 'win' then 1 else 0 end)`,
      losses: sql<number>`sum(case when ${schema.signals.outcome} = 'loss' then 1 else 0 end)`,
      pending: sql<number>`sum(case when ${schema.signals.outcome} = 'pending' then 1 else 0 end)`,
      netPct: sql<number>`sum(case when ${schema.signals.outcome} = 'win' then ${schema.signals.payout} when ${schema.signals.outcome} = 'loss' then -100 else 0 end)`,
    })
    .from(schema.signals)
    .where(isNotNull(schema.signals.tradeDay))
    .groupBy(schema.signals.tradeDay)
    .orderBy(desc(schema.signals.tradeDay))
    .limit(limit);

  return rows
    .filter((r): r is typeof r & { day: string } => Boolean(r.day))
    .map((r) => ({
      day: r.day,
      trades: Number(r.trades),
      wins: Number(r.wins),
      losses: Number(r.losses),
      pending: Number(r.pending),
      winrate:
        Number(r.wins) + Number(r.losses)
          ? Number(((Number(r.wins) / (Number(r.wins) + Number(r.losses))) * 100).toFixed(1))
          : 0,
      netPct: Number(Number(r.netPct).toFixed(2)),
    }));
}

/** Сводка за несколько последних дней — контекст для отчёта. */
export async function rangeTally(days: string[]): Promise<Tally> {
  if (!days.length) return empty();
  const rows = await db
    .select({ outcome: schema.signals.outcome, payout: schema.signals.payout })
    .from(schema.signals)
    .where(inArray(schema.signals.tradeDay, days));
  return rows.reduce((acc, row) => add(acc, row), empty());
}

export const todayKey = () => kyivDay();
