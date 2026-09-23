/**
 * Слепок входа: всё, на чём построено решение по сигналу.
 *
 * Пишется в signals.snapshot вместе с сигналом и дальше не меняется — именно по
 * этим данным ежедневный отчёт разбирает, что именно подвело, а не гадает по
 * итоговой цифре уверенности.
 */

import { kyivDay, kyivHour } from "../lib/day";
import type { CandleSet } from "../market/candles";
import type { Settings } from "../engine/store";
import type { Analysis, Factor } from "./analyze";
import type { Candle } from "./indicators";
import type { Level, MarketStructure } from "./structure";

/**
 * v3: с этой версии сигналы, дошедшие до исхода, дополнительно получают
 * сырые минутные бары после экспирации — в колонке `signals.postentryCandles`,
 * отдельным поздним проходом (см. `engine/outcomes.ts#capturePostEntryCandles`).
 * Сам объект снапшота не меняет форму, только факт: у v3+ есть шанс получить
 * пост-входное окно, у v2 и старее — нет, симулятору сверяться по этому полю.
 */
export const SNAPSHOT_VERSION = 3;

export interface EntrySnapshot {
  version: number;
  capturedAt: string;
  tradeDay: string;
  /** Час киевских суток — по нему видно «плохие» сессии. */
  kyivHour: number;
  symbol: string;
  assetName: string;
  isOtc: boolean;
  payout: number;
  lowPayout: boolean;
  feedSource: string;
  lastCandleAt: string;
  decision: {
    direction: string;
    confidence: number;
    score: number;
    maxScore: number;
    callScore: number;
    putScore: number;
    /** Перевес голосов в сторону сигнала, 0–1. */
    margin: number;
    expirySeconds: number;
    entryPrice: number;
    triggerM5: string;
    biasH30: string;
    biasM15: string;
    blockers: string[];
  };
  indicators: {
    rsi5: number | null;
    macd5Hist: number | null;
    macd15Hist: number | null;
    atrPct: number;
    /** Волатильность в пунктах цены. */
    atrAbs: number;
    patterns: string[];
  };
  structure: {
    m30: MarketStructure | null;
    m15: MarketStructure | null;
    m5: MarketStructure | null;
  };
  levels: Level[];
  /** Ближайший уровень против входа: сколько ATR до него. */
  levelAhead: { kind: string; price: number; distanceAtr: number } | null;
  factors: Factor[];
  reasons: string[];
  candles: { m5: Candle[]; m15: Candle[]; m30: Candle[] };
  engine: {
    minConfidence: number;
    minPayout: number;
    maxPayout: number;
    cooldownMinutes: number;
    scanIntervalSec: number;
  };
}

function tail(candles: Candle[], count: number): Candle[] {
  return candles.slice(-count).map((c) => ({
    time: c.time,
    open: Number(c.open.toFixed(6)),
    high: Number(c.high.toFixed(6)),
    low: Number(c.low.toFixed(6)),
    close: Number(c.close.toFixed(6)),
  }));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildSnapshot(input: {
  set: CandleSet;
  analysis: Analysis;
  asset: { symbol: string; name: string; isOtc: boolean; payout: number };
  lowPayout: boolean;
  settings: Settings;
  entryAt: Date;
}): EntrySnapshot {
  const { set, analysis, asset, settings, entryAt } = input;
  const d = analysis.details as Record<string, unknown>;

  const callScore = num(d.callScore) ?? 0;
  const putScore = num(d.putScore) ?? 0;
  const atrPct = num(d.atrPct) ?? 0;
  const levels = Array.isArray(d.levels) ? (d.levels as Level[]) : [];

  // Уровень «по курсу» сделки: сопротивление для call, поддержка для put.
  const wantKind = analysis.direction === "call" ? "resistance" : "support";
  const ahead = levels
    .filter((l) => l.kind === wantKind)
    .sort((a, b) => Math.abs(a.distanceAtr) - Math.abs(b.distanceAtr))[0];

  return {
    version: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    tradeDay: kyivDay(entryAt),
    kyivHour: kyivHour(entryAt),
    symbol: asset.symbol,
    assetName: asset.name,
    isOtc: asset.isOtc,
    payout: asset.payout,
    lowPayout: input.lowPayout,
    feedSource: set.source,
    lastCandleAt: new Date(set.lastCandleAt * 1000).toISOString(),
    decision: {
      direction: analysis.direction ?? "none",
      confidence: analysis.confidence,
      score: analysis.score,
      maxScore: analysis.maxScore,
      callScore,
      putScore,
      margin:
        callScore + putScore > 0
          ? Number((Math.abs(callScore - putScore) / (callScore + putScore)).toFixed(3))
          : 0,
      expirySeconds: analysis.expirySeconds,
      entryPrice: analysis.price,
      triggerM5: analysis.triggerM5,
      biasH30: analysis.biasH30,
      biasM15: analysis.biasM15,
      blockers: analysis.blockers,
    },
    indicators: {
      rsi5: num(d.rsi5),
      macd5Hist: num(d.macd5Hist),
      macd15Hist: num(d.macd15Hist),
      atrPct,
      atrAbs: Number(((atrPct / 100) * analysis.price).toFixed(6)),
      patterns: Array.isArray(d.patterns) ? (d.patterns as string[]) : [],
    },
    structure: {
      m30: (d.structure30 as MarketStructure) ?? null,
      m15: (d.structure15 as MarketStructure) ?? null,
      m5: (d.structure5 as MarketStructure) ?? null,
    },
    levels,
    levelAhead: ahead
      ? { kind: ahead.kind, price: ahead.price, distanceAtr: ahead.distanceAtr }
      : null,
    factors: analysis.factors,
    reasons: analysis.reasons,
    candles: { m5: tail(set.m5, 10), m15: tail(set.m15, 5), m30: tail(set.m30, 5) },
    engine: {
      minConfidence: settings.minConfidence,
      minPayout: settings.minPayout,
      maxPayout: settings.maxPayout,
      cooldownMinutes: settings.cooldownMinutes,
      scanIntervalSec: settings.scanIntervalSec,
    },
  };
}
