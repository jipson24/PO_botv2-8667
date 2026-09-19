export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : Number.NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = Number.NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) {
      out.push(Number.NaN);
      continue;
    }
    if (Number.isNaN(prev)) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
      prev = sum / period;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** RSI по Уайлдеру. */
export function rsi(values: number[], period = 14): number[] {
  const out: number[] = Array.from({ length: values.length }, () => Number.NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    Number.isNaN(emaFast[i]!) || Number.isNaN(emaSlow[i]!) ? Number.NaN : emaFast[i]! - emaSlow[i]!,
  );
  const valid = macdLine.filter((v) => !Number.isNaN(v));
  const signalValid = ema(valid, signalPeriod);
  const offset = macdLine.length - valid.length;
  const signal: number[] = Array.from({ length: macdLine.length }, () => Number.NaN);
  for (let i = 0; i < signalValid.length; i++) signal[i + offset] = signalValid[i]!;
  const histogram = macdLine.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]!) ? Number.NaN : v - signal[i]!,
  );
  return { macd: macdLine, signal, histogram };
}

/** ATR по Уайлдеру. */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = Array.from({ length: candles.length }, () => Number.NaN);
  if (candles.length <= period) return out;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    trs.push(
      Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)),
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i]!;
  let prevAtr = sum / period;
  out[period] = prevAtr;
  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]!) / period;
    out[i] = prevAtr;
  }
  return out;
}

export function last<T>(arr: T[], back = 0): T | undefined {
  return arr[arr.length - 1 - back];
}

/** Последнее не-NaN значение серии. */
export function lastValid(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]!;
    if (!Number.isNaN(v)) return v;
  }
  return Number.NaN;
}

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}
