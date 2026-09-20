/**
 * Цена пары в конкретный момент — нужна, чтобы закрыть сигнал по факту.
 *
 * Экспирации кратны минуте (вход по закрытию 5m свечи + 180/300/600/900 сек),
 * поэтому работаем на минутных свечах: закрытие минутной свечи, которая
 * заканчивается ровно в момент экспирации, и есть цена экспирации. Источник —
 * тот же, что у сканера: сначала родной фид Pocket Option (единственный для
 * OTC), иначе публичный фид.
 */

import type { Candle } from "../strategy/indicators";
import { isOtc, toFeedSymbol } from "./candles";
import { poCandles, ssidLooksLikeCookie } from "./po-feed";

const PERIOD = 60;
const CACHE_TTL_MS = 30_000;
/** Обычная глубина: четыре часа минутных свечей. */
const BASE_BARS = 240;
/** Потолок глубины у PO: 6 страниц по 150 свечей. */
const MAX_BARS = 900;
const cache = new Map<string, { at: number; candles: Candle[]; bars: number }>();

/** Сколько минутных свечей нужно, чтобы дотянуться до момента `at`. */
function depthFor(at: number): number {
  const minutesBack = Math.ceil((Date.now() / 1000 - at) / 60) + 30;
  return Math.min(MAX_BARS, Math.max(BASE_BARS, minutesBack));
}

export interface PriceAt {
  price: number;
  /** Метка времени, к которой относится цена (закрытие минутной свечи). */
  at: number;
  /** Насколько цена отстоит от запрошенного момента, сек. 0 — точное попадание. */
  driftSec: number;
  source: string;
}

async function minuteCandles(
  poSymbol: string,
  bars: number,
): Promise<{ candles: Candle[]; source: string }> {
  const cached = cache.get(poSymbol);
  if (cached && cached.bars >= bars && Date.now() - cached.at < CACHE_TTL_MS) {
    return { candles: cached.candles, source: "cache" };
  }

  let candles: Candle[] = [];
  let source = "";
  if (ssidLooksLikeCookie()) {
    try {
      candles = await poCandles(poSymbol, PERIOD, bars);
      source = "pocket-option";
    } catch (error) {
      if (isOtc(poSymbol)) throw error;
    }
  }

  if (!candles.length) {
    const feedSymbol = toFeedSymbol(poSymbol);
    if (!feedSymbol) throw new Error(`${poSymbol}: минутных свечей нет — нужен фид PO`);
    candles = await fetchMinute(feedSymbol);
    source = "public-feed";
  }

  cache.set(poSymbol, { at: Date.now(), candles, bars });
  return { candles, source };
}

async function fetchMinute(feedSymbol: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    feedSymbol,
  )}?interval=1m&range=2d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`feed ${feedSymbol}: HTTP ${res.status}`);

  const json = (await res.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: {
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
          }[];
        };
      }[];
    };
  };
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const ts = result?.timestamp;
  if (!ts || !quote) throw new Error(`feed ${feedSymbol}: пустой ответ`);

  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: ts[i]!, open: o, high: h, low: l, close: c });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * Цена на момент `at` (epoch, сек).
 *
 * Возвращает `null`, если история ещё не доехала до этого момента: закрывать
 * сделку по цене «до экспирации» нельзя — результат был бы выдуман.
 */
export async function priceAt(poSymbol: string, at: number): Promise<PriceAt | null> {
  const { candles, source } = await minuteCandles(poSymbol, depthFor(at));
  if (!candles.length) return null;

  const covered = candles.at(-1)!.time + PERIOD;
  if (covered < at) return null;

  // Последняя свеча, закрывшаяся не позже момента экспирации.
  let best: Candle | null = null;
  for (const candle of candles) {
    if (candle.time + PERIOD <= at) best = candle;
    else break;
  }
  if (!best) return null;

  const closedAt = best.time + PERIOD;
  const driftSec = at - closedAt;
  // Разрыв больше 10 минут — в данных дыра (рынок стоял), это не цена экспирации.
  if (driftSec > 600) return null;

  return { price: best.close, at: closedAt, driftSec, source };
}
