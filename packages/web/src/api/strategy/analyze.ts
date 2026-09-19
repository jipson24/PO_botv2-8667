import { type Candle, atr, closes, macd, rsi } from "./indicators";
import {
  type Bias,
  type Direction,
  analyzeStructure,
  detectLiquiditySweep,
  detectPatterns,
  findFvg,
  findLevels,
  findOrderBlock,
} from "./structure";

export interface TimeframeSet {
  m5: Candle[];
  m15: Candle[];
  m30: Candle[];
}

export interface Factor {
  /** Короткий тег фактора, например "30m структура". */
  label: string;
  /** Что именно найдено. */
  detail: string;
  direction: Direction | "neutral";
  weight: number;
}

export interface Analysis {
  direction: Direction | null;
  /** 0..100 */
  confidence: number;
  score: number;
  maxScore: number;
  biasH30: string;
  biasM15: string;
  triggerM5: string;
  expirySeconds: number;
  price: number;
  factors: Factor[];
  reasons: string[];
  blockers: string[];
  details: Record<string, unknown>;
}

/** Доступные экспирации Pocket Option (сек). */
const EXPIRIES = [60, 120, 180, 300, 600, 900];
/** Минимальная экспирация: короче 3 минут не даём — окно входа съедает задержка. */
const MIN_EXPIRY = 180;

function biasLabel(b: Bias): string {
  return b === "bullish" ? "вверх" : b === "bearish" ? "вниз" : "нейтрально";
}

function dirOf(b: Bias): Direction | "neutral" {
  return b === "bullish" ? "call" : b === "bearish" ? "put" : "neutral";
}

/**
 * Мультитаймфреймовый анализ: 30m задаёт bias, 15m подтверждает зоной/имбалансом,
 * 5m даёт триггер входа. Каждый фактор голосует за направление со своим весом.
 */
export function analyze(tf: TimeframeSet): Analysis {
  const factors: Factor[] = [];
  const blockers: string[] = [];

  const s30 = analyzeStructure(tf.m30);
  const s15 = analyzeStructure(tf.m15);
  const s5 = analyzeStructure(tf.m5);

  const price = tf.m5.at(-1)!.close;

  // --- 30m: общий bias (Smart Money структура)
  factors.push({
    label: "30m структура",
    detail: `${s30.pattern} (${biasLabel(s30.bias)})`,
    direction: dirOf(s30.bias),
    weight: 2.4,
  });
  if (s30.bos) {
    factors.push({
      label: "30m BOS",
      detail: "пробой структуры в сторону тренда",
      direction: s30.bos,
      weight: 1.2,
    });
  }
  if (s30.choch) {
    factors.push({
      label: "30m CHoCH",
      detail: "смена характера структуры",
      direction: s30.choch,
      weight: 1.0,
    });
  }
  // Premium/discount: в дискаунте покупки приоритетнее, в премиуме — продажи.
  if (s30.zone !== "equilibrium") {
    factors.push({
      label: "30m зона",
      detail: s30.zone === "discount" ? "discount (дешёвая зона)" : "premium (дорогая зона)",
      direction: s30.zone === "discount" ? "call" : "put",
      weight: 1.0,
    });
  }

  // --- 15m: подтверждение
  factors.push({
    label: "15m структура",
    detail: `${s15.pattern} (${biasLabel(s15.bias)})`,
    direction: dirOf(s15.bias),
    weight: 1.8,
  });

  const ob15 = findOrderBlock(tf.m15);
  if (ob15) {
    const inside = price >= ob15.bottom * 0.9995 && price <= ob15.top * 1.0005;
    factors.push({
      label: "15m order block",
      detail: inside ? "цена в зоне OB" : "OB по тренду выше/ниже",
      direction: ob15.direction,
      weight: inside ? 1.5 : 0.6,
    });
  }

  const fvg15 = findFvg(tf.m15, 20);
  const nearFvg = fvg15.find((f) => price >= f.bottom && price <= f.top);
  if (nearFvg) {
    factors.push({
      label: "15m имбаланс",
      detail: "цена внутри FVG",
      direction: nearFvg.direction,
      weight: 1.2,
    });
  }

  const m15Macd = macd(closes(tf.m15));
  const h15 = m15Macd.histogram.at(-1) ?? Number.NaN;
  const h15prev = m15Macd.histogram.at(-2) ?? Number.NaN;
  if (!Number.isNaN(h15) && !Number.isNaN(h15prev)) {
    const rising = h15 > h15prev;
    factors.push({
      label: "15m MACD",
      detail: `гистограмма ${h15 > 0 ? "выше" : "ниже"} нуля, ${rising ? "растёт" : "падает"}`,
      direction: h15 > 0 && rising ? "call" : h15 < 0 && !rising ? "put" : "neutral",
      weight: 1.3,
    });
  }

  // --- 5m: триггер входа
  const patterns = detectPatterns(tf.m5);
  const bestPattern = patterns.sort((a, b) => b.strength - a.strength)[0];
  if (bestPattern) {
    factors.push({
      label: "5m паттерн",
      detail: bestPattern.name,
      direction: bestPattern.direction,
      weight: 1.6 * bestPattern.strength,
    });
  }

  const sweep5 = detectLiquiditySweep(tf.m5);
  if (sweep5) {
    factors.push({
      label: "5m ликвидность",
      detail: "снятие ликвидности с возвратом",
      direction: sweep5,
      weight: 1.4,
    });
  }

  const m5Macd = macd(closes(tf.m5));
  const h5 = m5Macd.histogram.at(-1) ?? Number.NaN;
  const h5prev = m5Macd.histogram.at(-2) ?? Number.NaN;
  let macdCross: Direction | "neutral" = "neutral";
  if (!Number.isNaN(h5) && !Number.isNaN(h5prev)) {
    const cross = h5 > 0 && h5prev <= 0 ? "call" : h5 < 0 && h5prev >= 0 ? "put" : "neutral";
    macdCross = cross;
    factors.push({
      label: "5m MACD",
      detail:
        cross === "neutral"
          ? `импульс ${h5 > h5prev ? "усиливается" : "слабеет"}`
          : "пересечение нулевой линии",
      direction: cross === "neutral" ? (h5 > h5prev ? "call" : "put") : cross,
      weight: cross === "neutral" ? 0.8 : 1.4,
    });
  }

  const r5 = rsi(closes(tf.m5));
  const rsiNow = r5.at(-1) ?? Number.NaN;
  if (!Number.isNaN(rsiNow)) {
    let rsiDir: Direction | "neutral" = "neutral";
    let rsiDetail = `RSI ${rsiNow.toFixed(1)}`;
    if (rsiNow <= 30) {
      rsiDir = "call";
      rsiDetail = `перепроданность (${rsiNow.toFixed(1)})`;
    } else if (rsiNow >= 70) {
      rsiDir = "put";
      rsiDetail = `перекупленность (${rsiNow.toFixed(1)})`;
    } else if (rsiNow > 50 && rsiNow < 65) {
      rsiDir = "call";
      rsiDetail = `выше середины (${rsiNow.toFixed(1)})`;
    } else if (rsiNow < 50 && rsiNow > 35) {
      rsiDir = "put";
      rsiDetail = `ниже середины (${rsiNow.toFixed(1)})`;
    }
    factors.push({ label: "5m RSI", detail: rsiDetail, direction: rsiDir, weight: 1.1 });

    // Дивергенция RSI против последних экстремумов цены.
    const div = rsiDivergence(tf.m5, r5);
    if (div) {
      factors.push({
        label: "5m дивергенция",
        detail: div === "call" ? "бычья дивергенция RSI" : "медвежья дивергенция RSI",
        direction: div,
        weight: 1.3,
      });
    }
  }

  // --- Уровни поддержки/сопротивления (на 15m как рабочем ТФ)
  const levels = findLevels(tf.m15);
  const nearest = levels[0];
  if (nearest && nearest.distanceAtr <= 0.5) {
    factors.push({
      label: "Уровень 15m",
      detail: `цена у ${nearest.kind === "support" ? "поддержки" : "сопротивления"} ${nearest.price.toFixed(5)} (${nearest.touches} касаний)`,
      direction: nearest.kind === "support" ? "call" : "put",
      weight: 1.5 + Math.min(nearest.touches, 4) * 0.15,
    });
  } else if (nearest) {
    factors.push({
      label: "Уровень 15m",
      detail: `ближайший ${nearest.kind === "support" ? "саппорт" : "резист"} в ${nearest.distanceAtr} ATR`,
      direction: "neutral",
      weight: 0,
    });
  }

  // --- Подсчёт голосов
  let callScore = 0;
  let putScore = 0;
  let maxScore = 0;
  for (const f of factors) {
    maxScore += f.weight;
    if (f.direction === "call") callScore += f.weight;
    else if (f.direction === "put") putScore += f.weight;
  }

  const direction: Direction | null =
    callScore === putScore ? null : callScore > putScore ? "call" : "put";
  const score = Math.max(callScore, putScore);
  const opposite = Math.min(callScore, putScore);

  // Конфликт старших ТФ — сигнал не выдаём.
  const aligned30 = direction !== null && (dirOf(s30.bias) === direction || s30.bias === "neutral");
  const aligned15 = direction !== null && (dirOf(s15.bias) === direction || s15.bias === "neutral");
  if (!aligned30) blockers.push("30m структура против направления");
  if (!aligned15) blockers.push("15m структура против направления");
  if (direction && dirOf(s5.bias) !== direction && s5.bias !== "neutral") {
    blockers.push("5m структура против направления");
  }

  // Триггер входа на 5m должен смотреть в ту же сторону, что и сигнал.
  const alignedPattern = direction ? patterns.find((p) => p.direction === direction) : undefined;
  const triggerM5 = alignedPattern
    ? alignedPattern.name
    : direction && sweep5 === direction
      ? "снятие ликвидности с возвратом"
      : direction && macdCross === direction
        ? "MACD: пересечение нулевой линии"
        : "нет триггера";
  if (direction && triggerM5 === "нет триггера") {
    blockers.push("нет триггера входа на 5m");
  }

  // Уверенность: доля веса в сторону сигнала с поправкой на противовес.
  const rawConfidence = maxScore > 0 ? ((score - opposite * 0.75) / maxScore) * 100 : 0;
  const confidence = Math.max(0, Math.min(100, Math.round(rawConfidence * 1.35)));

  const atr5 = atr(tf.m5, 14).at(-1) ?? 0;
  const atrPct = price > 0 ? (atr5 / price) * 100 : 0;
  const expirySeconds = pickExpiry(atrPct, Boolean(bestPattern), Boolean(sweep5));

  const reasons = factors
    .filter((f) => f.direction === direction && f.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((f) => `${f.label}: ${f.detail}`);

  return {
    direction,
    confidence,
    score: Number(score.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    biasH30: `${s30.pattern} → ${biasLabel(s30.bias)}`,
    biasM15: `${s15.pattern} → ${biasLabel(s15.bias)}`,
    triggerM5,
    expirySeconds,
    price,
    factors,
    reasons,
    blockers,
    details: {
      structure30: s30,
      structure15: s15,
      structure5: s5,
      levels: levels.slice(0, 4),
      rsi5: Number.isNaN(rsiNow) ? null : Number(rsiNow.toFixed(2)),
      macd5Hist: Number.isNaN(h5) ? null : Number(h5.toFixed(6)),
      macd15Hist: Number.isNaN(h15) ? null : Number(h15.toFixed(6)),
      atrPct: Number(atrPct.toFixed(4)),
      patterns: patterns.map((p) => p.name),
      callScore: Number(callScore.toFixed(2)),
      putScore: Number(putScore.toFixed(2)),
    },
  };
}

/** Дивергенция: цена делает новый экстремум, RSI — нет. */
function rsiDivergence(candles: Candle[], rsiSeries: number[]): Direction | null {
  const n = candles.length;
  if (n < 20) return null;
  const windowA = candles.slice(n - 20, n - 10);
  const windowB = candles.slice(n - 10);
  const rsiA = rsiSeries.slice(n - 20, n - 10).filter((v) => !Number.isNaN(v));
  const rsiB = rsiSeries.slice(n - 10).filter((v) => !Number.isNaN(v));
  if (!rsiA.length || !rsiB.length) return null;

  const lowA = Math.min(...windowA.map((c) => c.low));
  const lowB = Math.min(...windowB.map((c) => c.low));
  const highA = Math.max(...windowA.map((c) => c.high));
  const highB = Math.max(...windowB.map((c) => c.high));
  const rsiLowA = Math.min(...rsiA);
  const rsiLowB = Math.min(...rsiB);
  const rsiHighA = Math.max(...rsiA);
  const rsiHighB = Math.max(...rsiB);

  if (lowB < lowA && rsiLowB > rsiLowA + 2) return "call";
  if (highB > highA && rsiHighB < rsiHighA - 2) return "put";
  return null;
}

/** Экспирация от волатильности: тише рынок — дольше держим. */
function pickExpiry(atrPct: number, hasPattern: boolean, hasSweep: boolean): number {
  let target = 300;
  if (atrPct > 0.12) target = 120;
  else if (atrPct > 0.07) target = 180;
  else if (atrPct > 0.04) target = 300;
  else target = 600;
  if (hasSweep && target > 180) target = 180;
  if (!hasPattern && target < 300) target = 300;
  // Ниже 3 минут не уходим: сигнал публикуется через несколько секунд после
  // закрытия свечи, и на 60–120 сек окна входа уже не остаётся.
  return EXPIRIES.filter((e) => e >= MIN_EXPIRY).reduce((best, e) =>
    Math.abs(e - target) < Math.abs(best - target) ? e : best,
  );
}
