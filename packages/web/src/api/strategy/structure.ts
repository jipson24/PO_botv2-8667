import { type Candle, atr } from "./indicators";

export type Direction = "call" | "put";
export type Bias = "bullish" | "bearish" | "neutral";

export interface Swing {
  index: number;
  price: number;
  kind: "high" | "low";
}

/** Фрактальные экстремумы: свеча выше/ниже `strength` соседей с каждой стороны. */
export function findSwings(candles: Candle[], strength = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = strength; i < candles.length - strength; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= c.high) isHigh = false;
      if (candles[j]!.low <= c.low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, price: c.high, kind: "high" });
    if (isLow) swings.push({ index: i, price: c.low, kind: "low" });
  }
  return swings;
}

export interface MarketStructure {
  bias: Bias;
  /** Описание последовательности: HH/HL, LH/LL и т.д. */
  pattern: string;
  /** Смена характера структуры (CHoCH) в последних свечах. */
  choch: Direction | null;
  /** Пробой структуры (BOS) в сторону тренда. */
  bos: Direction | null;
  swingHigh: number | null;
  swingLow: number | null;
  /** Позиция цены в диапазоне последнего свинга: 0 = лой, 1 = хай. */
  rangePosition: number;
  /** premium (>0.62), discount (<0.38), equilibrium. */
  zone: "premium" | "discount" | "equilibrium";
}

/** Smart Money структура: HH/HL vs LH/LL, BOS, CHoCH, premium/discount. */
export function analyzeStructure(candles: Candle[]): MarketStructure {
  const swings = findSwings(candles, 2);
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const lastClose = candles.at(-1)?.close ?? 0;

  const h1 = highs.at(-1);
  const h2 = highs.at(-2);
  const l1 = lows.at(-1);
  const l2 = lows.at(-2);

  let bias: Bias = "neutral";
  let pattern = "range";
  if (h1 && h2 && l1 && l2) {
    const hh = h1.price > h2.price;
    const hl = l1.price > l2.price;
    const lh = h1.price < h2.price;
    const ll = l1.price < l2.price;
    if (hh && hl) {
      bias = "bullish";
      pattern = "HH + HL";
    } else if (lh && ll) {
      bias = "bearish";
      pattern = "LH + LL";
    } else if (hh && ll) {
      pattern = "расширение диапазона";
    } else if (lh && hl) {
      pattern = "сужение (компрессия)";
    } else if (hh || hl) {
      bias = "bullish";
      pattern = hh ? "HH" : "HL";
    } else if (lh || ll) {
      bias = "bearish";
      pattern = lh ? "LH" : "LL";
    }
  }

  // BOS/CHoCH: закрытие за последним структурным экстремумом на последних 3 свечах.
  let bos: Direction | null = null;
  let choch: Direction | null = null;
  const recent = candles.slice(-3);
  if (h1) {
    const brokeUp = recent.some((c) => c.close > h1.price);
    if (brokeUp) {
      if (bias === "bullish") bos = "call";
      else choch = "call";
    }
  }
  if (l1) {
    const brokeDown = recent.some((c) => c.close < l1.price);
    if (brokeDown) {
      if (bias === "bearish") bos = "put";
      else choch = "put";
    }
  }

  const rangeHigh = h1?.price ?? Math.max(...candles.slice(-30).map((c) => c.high));
  const rangeLow = l1?.price ?? Math.min(...candles.slice(-30).map((c) => c.low));
  const span = rangeHigh - rangeLow;
  const rangePosition = span > 0 ? (lastClose - rangeLow) / span : 0.5;
  const zone = rangePosition > 0.62 ? "premium" : rangePosition < 0.38 ? "discount" : "equilibrium";

  return {
    bias,
    pattern,
    choch,
    bos,
    swingHigh: h1?.price ?? null,
    swingLow: l1?.price ?? null,
    rangePosition: Number(rangePosition.toFixed(3)),
    zone,
  };
}

export interface Level {
  price: number;
  touches: number;
  kind: "support" | "resistance";
  /** Расстояние до цены в ATR. */
  distanceAtr: number;
}

/** Кластеризация свинг-точек в уровни поддержки/сопротивления. */
export function findLevels(candles: Candle[]): Level[] {
  const atrSeries = atr(candles, 14);
  const a = atrSeries.at(-1) ?? 0;
  if (!a || Number.isNaN(a)) return [];
  const tolerance = a * 0.6;
  const swings = findSwings(candles, 2);
  const lastClose = candles.at(-1)!.close;

  const clusters: { price: number; touches: number; kind: "high" | "low" }[] = [];
  for (const s of swings) {
    const hit = clusters.find(
      (c) => Math.abs(c.price - s.price) <= tolerance && c.kind === s.kind,
    );
    if (hit) {
      hit.price = (hit.price * hit.touches + s.price) / (hit.touches + 1);
      hit.touches += 1;
    } else {
      clusters.push({ price: s.price, touches: 1, kind: s.kind });
    }
  }

  return clusters
    .map((c) => ({
      price: c.price,
      touches: c.touches,
      kind: (c.price < lastClose ? "support" : "resistance") as "support" | "resistance",
      distanceAtr: Number((Math.abs(c.price - lastClose) / a).toFixed(2)),
    }))
    .sort((x, y) => x.distanceAtr - y.distanceAtr);
}

export interface Imbalance {
  direction: Direction;
  top: number;
  bottom: number;
  index: number;
}

/** FVG / имбаланс: разрыв между тенями свечей i-1 и i+1. */
export function findFvg(candles: Candle[], lookback = 20): Imbalance[] {
  const out: Imbalance[] = [];
  const start = Math.max(1, candles.length - lookback);
  for (let i = start; i < candles.length - 1; i++) {
    const prev = candles[i - 1]!;
    const next = candles[i + 1]!;
    if (next.low > prev.high) {
      out.push({ direction: "call", bottom: prev.high, top: next.low, index: i });
    } else if (next.high < prev.low) {
      out.push({ direction: "put", bottom: next.high, top: prev.low, index: i });
    }
  }
  return out;
}

/** Снятие ликвидности: прокол экстремума тенью с возвратом внутрь диапазона. */
export function detectLiquiditySweep(candles: Candle[], lookback = 12): Direction | null {
  if (candles.length < lookback + 2) return null;
  const c = candles.at(-1)!;
  const window = candles.slice(-lookback - 1, -1);
  const priorHigh = Math.max(...window.map((x) => x.high));
  const priorLow = Math.min(...window.map((x) => x.low));
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  if (c.high > priorHigh && c.close < priorHigh && upperWick > body) return "put";
  if (c.low < priorLow && c.close > priorLow && lowerWick > body) return "call";
  return null;
}

export interface OrderBlock {
  direction: Direction;
  top: number;
  bottom: number;
}

/** Order block: последняя противоположная свеча перед импульсом. */
export function findOrderBlock(candles: Candle[], lookback = 25): OrderBlock | null {
  const atrSeries = atr(candles, 14);
  const a = atrSeries.at(-1) ?? 0;
  if (!a || Number.isNaN(a)) return null;
  for (let i = candles.length - 2; i > Math.max(1, candles.length - lookback); i--) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const impulse = Math.abs(c.close - c.open);
    if (impulse < a * 1.2) continue;
    const bullishImpulse = c.close > c.open;
    const prevOpposite = bullishImpulse ? prev.close < prev.open : prev.close > prev.open;
    if (!prevOpposite) continue;
    return {
      direction: bullishImpulse ? "call" : "put",
      top: Math.max(prev.open, prev.close),
      bottom: Math.min(prev.open, prev.close),
    };
  }
  return null;
}

export interface CandlePattern {
  name: string;
  direction: Direction;
  strength: number;
}

/** Свечные паттерны на последней закрытой свече. */
export function detectPatterns(candles: Candle[]): CandlePattern[] {
  const out: CandlePattern[] = [];
  if (candles.length < 4) return out;
  const c = candles.at(-1)!;
  const p = candles.at(-2)!;
  const p2 = candles.at(-3)!;

  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low || 1e-9;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const prevBody = Math.abs(p.close - p.open);
  const bull = c.close > c.open;

  // Поглощение
  if (
    bull &&
    p.close < p.open &&
    c.close >= p.open &&
    c.open <= p.close &&
    body > prevBody * 1.05
  ) {
    out.push({ name: "Бычье поглощение", direction: "call", strength: 1 });
  }
  if (
    !bull &&
    p.close > p.open &&
    c.close <= p.open &&
    c.open >= p.close &&
    body > prevBody * 1.05
  ) {
    out.push({ name: "Медвежье поглощение", direction: "put", strength: 1 });
  }

  // Пин-бар / молот / падающая звезда
  if (lowerWick > body * 2 && upperWick < body && body / range < 0.4) {
    out.push({ name: "Молот (пин-бар)", direction: "call", strength: 0.9 });
  }
  if (upperWick > body * 2 && lowerWick < body && body / range < 0.4) {
    out.push({ name: "Падающая звезда", direction: "put", strength: 0.9 });
  }

  // Утренняя / вечерняя звезда
  const smallMiddle = prevBody < Math.abs(p2.close - p2.open) * 0.6;
  if (smallMiddle && p2.close < p2.open && bull && c.close > (p2.open + p2.close) / 2) {
    out.push({ name: "Утренняя звезда", direction: "call", strength: 1 });
  }
  if (smallMiddle && p2.close > p2.open && !bull && c.close < (p2.open + p2.close) / 2) {
    out.push({ name: "Вечерняя звезда", direction: "put", strength: 1 });
  }

  // Пробой внутреннего бара
  const inside = p.high < p2.high && p.low > p2.low;
  if (inside && c.close > p.high) {
    out.push({ name: "Пробой внутреннего бара", direction: "call", strength: 0.7 });
  }
  if (inside && c.close < p.low) {
    out.push({ name: "Пробой внутреннего бара", direction: "put", strength: 0.7 });
  }

  // Три солдата / три вороны
  const c1 = candles.at(-1)!;
  const c2 = candles.at(-2)!;
  const c3 = candles.at(-3)!;
  if (c1.close > c1.open && c2.close > c2.open && c3.close > c3.open && c1.close > c2.close) {
    out.push({ name: "Три белых солдата", direction: "call", strength: 0.6 });
  }
  if (c1.close < c1.open && c2.close < c2.open && c3.close < c3.open && c1.close < c2.close) {
    out.push({ name: "Три чёрные вороны", direction: "put", strength: 0.6 });
  }

  return out;
}
