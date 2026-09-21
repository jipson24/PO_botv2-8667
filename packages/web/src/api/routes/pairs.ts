import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { getCandleSet } from "../market/candles";
import { cachedSnapshot } from "../market/pocket-option";
import { syncAssets } from "../engine/scanner";
import { getSettings, isExcluded, parseExcluded } from "../engine/store";
import { analyze } from "../strategy/analyze";

export const pairs = {
  /** Все валютные пары с payout и статусом фида. */
  list: base.handler(async () => {
    const settings = await getSettings();
    const rows = await db
      .select()
      .from(schema.assets)
      .orderBy(desc(schema.assets.payout));
    const excluded = parseExcluded(settings.excludedSymbols);
    return rows.map((a) => ({
      ...a,
      inRange: a.payout >= settings.minPayout && a.payout <= settings.maxPayout,
      excluded: isExcluded(a.symbol, excluded),
    }));
  }),

  /** Обновить список активов из Pocket Option. */
  sync: base.handler(async () => {
    const result = await syncAssets();
    const snap = cachedSnapshot();
    return { ...result, fetchedAt: snap?.fetchedAt ?? null };
  }),

  toggle: base
    .input(z.object({ symbol: z.string(), isActive: z.boolean() }))
    .handler(async ({ input }) => {
      const [row] = await db
        .update(schema.assets)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(schema.assets.symbol, input.symbol))
        .returning();
      return row ?? null;
    }),

  /** Живой анализ одной пары — «что сканер видит прямо сейчас». */
  analyze: base.input(z.object({ symbol: z.string() })).handler(async ({ input }) => {
    try {
      const set = await getCandleSet(input.symbol);
      const result = analyze(set);
      return {
        ok: true as const,
        symbol: input.symbol,
        source: set.source,
        lastCandleAt: set.lastCandleAt,
        candles: set.m5.slice(-60),
        analysis: result,
      };
    } catch (error) {
      return { ok: false as const, symbol: input.symbol, error: (error as Error).message };
    }
  }),
};
