/**
 * Закрытие сигналов по факту: что реально случилось на экспирации.
 *
 * Бинарная сделка Pocket Option считается по цене в момент экспирации против
 * цены входа: CALL выигрывает при цене выше, PUT — при цене ниже, равенство
 * возвращает ставку (draw). До этого модуля результат нигде не фиксировался, и
 * статистика с отчётами опиралась бы на пустоту.
 */

import { and, asc, eq, isNull, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { kyivDay } from "../lib/day";
import { minuteWindow, priceAt } from "../market/history";

type Signal = typeof schema.signals.$inferSelect;

/** Фиду нужно время опубликовать минутную свечу экспирации. */
const GRACE_MS = 90_000;
/** Через сутки без данных сделку закрываем как «нет данных» — иначе висит вечно. */
const GIVE_UP_MS = 24 * 3600_000;
/** Сколько сигналов разбираем за проход: каждый — запрос истории. */
const BATCH = 25;

/**
 * Запас баров до входа и после экспирации в пост-входном окне (минуты).
 * До входа — с перекрытием того, что уже есть в `snapshot.candles`, чтобы
 * склеить окна без дырки на стыке. После экспирации — под будущие индикаторы.
 */
const POSTENTRY_BEFORE_MIN = 15;
const POSTENTRY_AFTER_MIN = 10;
/** Ждём столько после экспирации, чтобы фид точно догнал момент выхода + запас. */
const POSTENTRY_CAPTURE_DELAY_MS = (POSTENTRY_AFTER_MIN + 3) * 60_000;
/** Через сутки без данных бросаем попытку — иначе висит вечно как pending. */
const POSTENTRY_GIVE_UP_MS = 24 * 3600_000;
const POSTENTRY_BATCH = 25;

export type Outcome = "pending" | "win" | "loss" | "draw" | "unknown";

/** Итог сделки по цене входа и цене экспирации. */
export function judge(direction: string, entry: number, result: number): Outcome {
  if (result === entry) return "draw";
  const up = result > entry;
  if (direction === "call") return up ? "win" : "loss";
  if (direction === "put") return up ? "loss" : "win";
  return "unknown";
}

/** Прибыль сделки в процентах от ставки: payout при выигрыше, −100 при проигрыше. */
export function profitPct(outcome: string, payout: number): number {
  if (outcome === "win") return payout;
  if (outcome === "loss") return -100;
  return 0;
}

export interface ResolveReport {
  checked: number;
  resolved: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  skipped: number;
}

async function resolveOne(signal: Signal): Promise<Outcome> {
  const expiryEpoch = Math.floor(signal.expiresAt.getTime() / 1000);
  const tradeDay = signal.tradeDay ?? kyivDay(signal.entryAt);
  const overdue = Date.now() - signal.expiresAt.getTime() > GIVE_UP_MS;

  let quote: Awaited<ReturnType<typeof priceAt>> = null;
  let error = "";
  try {
    quote = await priceAt(signal.symbol, expiryEpoch);
  } catch (err) {
    error = (err as Error).message;
  }

  if (!quote) {
    if (!overdue) {
      if (signal.tradeDay !== tradeDay) {
        await db.update(schema.signals).set({ tradeDay }).where(eq(schema.signals.id, signal.id));
      }
      return "pending";
    }
    await db
      .update(schema.signals)
      .set({
        outcome: "unknown",
        resolvedAt: new Date(),
        resolveNote: error || "фид не отдал цену на момент экспирации",
        tradeDay,
      })
      .where(eq(schema.signals.id, signal.id));
    return "unknown";
  }

  const outcome = judge(signal.direction, signal.price, quote.price);
  const note = [
    `цена экспирации ${quote.price} (${quote.source})`,
    quote.driftSec ? `свеча закрылась на ${quote.driftSec} сек раньше экспирации` : "точное попадание",
  ].join(" · ");

  await db
    .update(schema.signals)
    .set({ outcome, resultPrice: quote.price, resolvedAt: new Date(), resolveNote: note, tradeDay })
    .where(eq(schema.signals.id, signal.id));

  return outcome;
}

/** Один проход по незакрытым сигналам с истёкшей экспирацией. */
export async function resolvePending(limit = BATCH): Promise<ResolveReport> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const rows = await db
    .select()
    .from(schema.signals)
    .where(and(eq(schema.signals.outcome, "pending"), lt(schema.signals.expiresAt, cutoff)))
    .orderBy(asc(schema.signals.expiresAt))
    .limit(limit);

  const report: ResolveReport = {
    checked: rows.length,
    resolved: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    unknown: 0,
    skipped: 0,
  };

  for (const row of rows) {
    try {
      const outcome = await resolveOne(row);
      if (outcome === "pending") report.skipped += 1;
      else report.resolved += 1;
      if (outcome === "win") report.wins += 1;
      if (outcome === "loss") report.losses += 1;
      if (outcome === "draw") report.draws += 1;
      if (outcome === "unknown") report.unknown += 1;
    } catch (error) {
      report.skipped += 1;
      console.error(
        `[outcomes] ${row.symbol} #${row.id}: не удалось закрыть — ${(error as Error).message}`,
      );
    }
  }

  if (report.resolved) {
    console.log(
      `[outcomes] закрыто ${report.resolved}: ${report.wins} в плюс · ${report.losses} в минус` +
        `${report.draws ? ` · ${report.draws} возврат` : ""}${
          report.unknown ? ` · ${report.unknown} без данных` : ""
        }`,
    );
  }
  return report;
}

/**
 * Простановка торгового дня старым сигналам: колонка появилась позже, а
 * статистика и архив группируются именно по ней.
 */
export async function backfillTradeDays(): Promise<number> {
  const rows = await db
    .select({ id: schema.signals.id, entryAt: schema.signals.entryAt })
    .from(schema.signals)
    .where(or(isNull(schema.signals.tradeDay), eq(schema.signals.tradeDay, "")))
    .limit(500);
  for (const row of rows) {
    await db
      .update(schema.signals)
      .set({ tradeDay: kyivDay(row.entryAt) })
      .where(eq(schema.signals.id, row.id));
  }
  if (rows.length) console.log(`[outcomes] торговый день проставлен у ${rows.length} сигналов`);
  return rows.length;
}

export const POSTENTRY_VERSION = 1;

export interface PostentryCandles {
  version: number;
  capturedAt: string;
  source: string;
  from: number;
  to: number;
  candles: { time: number; open: number; high: number; low: number; close: number }[];
}

export interface PostentryReport {
  checked: number;
  captured: number;
  waiting: number;
  gaveUp: number;
}

/**
 * Дозаписывает сырые минутные бары после экспирации сделкам, у которых уже
 * известен исход, но пост-входное окно ещё не собрано. `snapshot` не трогает —
 * пишет только в `postentryCandles`, отдельно и один раз на сигнал.
 */
export async function capturePostEntryCandles(limit = POSTENTRY_BATCH): Promise<PostentryReport> {
  const cutoff = new Date(Date.now() - POSTENTRY_CAPTURE_DELAY_MS);
  const rows = await db
    .select()
    .from(schema.signals)
    .where(
      and(
        or(
          eq(schema.signals.outcome, "win"),
          eq(schema.signals.outcome, "loss"),
          eq(schema.signals.outcome, "draw"),
        ),
        isNull(schema.signals.postentryCapturedAt),
        isNotNull(schema.signals.snapshot),
        lt(schema.signals.expiresAt, cutoff),
      ),
    )
    .orderBy(asc(schema.signals.expiresAt))
    .limit(limit);

  const report: PostentryReport = { checked: rows.length, captured: 0, waiting: 0, gaveUp: 0 };

  for (const row of rows) {
    const entryEpoch = Math.floor(row.entryAt.getTime() / 1000);
    const expiryEpoch = Math.floor(row.expiresAt.getTime() / 1000);
    const from = entryEpoch - POSTENTRY_BEFORE_MIN * 60;
    const to = expiryEpoch + POSTENTRY_AFTER_MIN * 60;
    const overdue = Date.now() - row.expiresAt.getTime() > POSTENTRY_GIVE_UP_MS;

    let window: Awaited<ReturnType<typeof minuteWindow>> = null;
    let error = "";
    try {
      window = await minuteWindow(row.symbol, from, to);
    } catch (err) {
      error = (err as Error).message;
    }

    if (!window) {
      if (!overdue) {
        report.waiting += 1;
        continue;
      }
      report.gaveUp += 1;
      console.error(
        `[outcomes] ${row.symbol} #${row.id}: пост-входные бары не собраны — ${error || "фид не дотянул историю"}`,
      );
      continue;
    }

    const payload: PostentryCandles = {
      version: POSTENTRY_VERSION,
      capturedAt: new Date().toISOString(),
      source: window.source,
      from,
      to,
      candles: window.candles.map((c) => ({
        time: c.time,
        open: Number(c.open.toFixed(6)),
        high: Number(c.high.toFixed(6)),
        low: Number(c.low.toFixed(6)),
        close: Number(c.close.toFixed(6)),
      })),
    };

    await db
      .update(schema.signals)
      .set({ postentryCandles: payload, postentryCapturedAt: new Date() })
      .where(eq(schema.signals.id, row.id));
    report.captured += 1;
  }

  if (report.captured || report.gaveUp) {
    console.log(
      `[outcomes] пост-входные бары: собрано ${report.captured}` +
        `${report.waiting ? ` · ${report.waiting} ждут фид` : ""}` +
        `${report.gaveUp ? ` · ${report.gaveUp} без данных` : ""}`,
    );
  }
  return report;
}

interface ResolverState {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
}

/** Таймер в globalThis: HMR не должен оставлять вторую копию цикла. */
const scope = globalThis as unknown as { __poOutcomes?: ResolverState };
const state: ResolverState = (scope.__poOutcomes ??= { timer: null, running: false });

const TICK_MS = 60_000;

async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    await resolvePending();
    await capturePostEntryCandles();
  } catch (error) {
    console.error("[outcomes] проход упал:", (error as Error).message);
  } finally {
    state.running = false;
  }
}

export function startOutcomeResolver() {
  if (state.timer) return;
  state.timer = setInterval(() => void tick(), TICK_MS);
  void backfillTradeDays()
    .then(() => tick())
    .catch((error) => console.error("[outcomes] старт:", (error as Error).message));
  console.log("[outcomes] закрытие сделок по факту: проверка каждую минуту");
}

export function outcomeResolverRunning(): boolean {
  return state.timer !== null;
}
