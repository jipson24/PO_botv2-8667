import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { runScan, scannerRunning } from "../engine/scanner";
import { getSettings } from "../engine/store";
import { formatSignal, publishSignal } from "../engine/telegram";

const listInput = z.object({
  limit: z.number().min(1).max(100).default(30),
  direction: z.enum(["call", "put"]).optional(),
  symbol: z.string().optional(),
});

export const signals = {
  /** Лента сигналов, свежие сверху. */
  list: base.input(listInput).handler(async ({ input }) => {
    const filters = [
      input.direction ? eq(schema.signals.direction, input.direction) : undefined,
      input.symbol ? eq(schema.signals.symbol, input.symbol) : undefined,
    ].filter(Boolean);

    const rows = await db
      .select()
      .from(schema.signals)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.signals.createdAt))
      .limit(input.limit);
    return rows;
  }),

  get: base.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    const [row] = await db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Сигнал не найден" });
    return row;
  }),

  /** Сводка для шапки дашборда. */
  overview: base.handler(async () => {
    const settings = await getSettings();
    const dayAgo = new Date(Date.now() - 24 * 3600_000);

    const [total] = await db.select({ value: count() }).from(schema.signals);
    const [today] = await db
      .select({ value: count() })
      .from(schema.signals)
      .where(gte(schema.signals.createdAt, dayAgo));
    const [calls] = await db
      .select({ value: count() })
      .from(schema.signals)
      .where(and(gte(schema.signals.createdAt, dayAgo), eq(schema.signals.direction, "call")));

    const [lastRun] = await db
      .select()
      .from(schema.scanRuns)
      .orderBy(desc(schema.scanRuns.startedAt))
      .limit(1);

    const assetRows = await db.select().from(schema.assets);
    const inRange = assetRows.filter(
      (a) => a.payout >= settings.minPayout && a.payout <= settings.maxPayout,
    );

    const [subs] = await db
      .select({ value: count() })
      .from(schema.subscribers)
      .where(eq(schema.subscribers.isActive, true));

    return {
      totalSignals: total?.value ?? 0,
      signalsToday: today?.value ?? 0,
      callsToday: calls?.value ?? 0,
      putsToday: (today?.value ?? 0) - (calls?.value ?? 0),
      scannerRunning: scannerRunning(),
      subscribers: subs?.value ?? 0,
      settings,
      lastRun: lastRun ?? null,
      pairs: {
        total: assetRows.length,
        inRange: inRange.length,
        ready: inRange.filter((a) => a.feedStatus === "ok").length,
        waiting: inRange.filter((a) => a.feedStatus !== "ok").length,
      },
    };
  }),

  /** Журнал последних проходов сканера. */
  runs: base.input(z.object({ limit: z.number().min(1).max(50).default(12) })).handler(
    ({ input }) =>
      db
        .select()
        .from(schema.scanRuns)
        .orderBy(desc(schema.scanRuns.startedAt))
        .limit(input.limit),
  ),

  /** Ручной проход сканера — кнопка «Сканировать сейчас». */
  scanNow: base.handler(() => runScan()),

  /** Повторная отправка сигнала в Telegram. */
  resend: base.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    const [row] = await db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Сигнал не найден" });
    const sent = await publishSignal(row);
    return { sent, preview: formatSignal(row) };
  }),
};
