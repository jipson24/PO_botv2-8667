import { z } from "zod";
import { base } from "../__core/app";
import {
  dailyReporterRunning,
  generateDailyReport,
  storedReport,
} from "../engine/daily-report";
import { TARGET_WINRATE, availableDays, dayStats, rangeTally, todayKey } from "../engine/stats";
import { kyivDay, shiftDay } from "../lib/day";

const dayInput = z.object({
  /** Киевские сутки в формате YYYY-MM-DD. Пусто — текущий день. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "День в формате YYYY-MM-DD")
    .optional(),
});

export const stats = {
  /** Дни с сигналами — для выбора дня во вкладке «Статистика». */
  days: base.input(z.object({ limit: z.number().min(1).max(120).default(45) })).handler(
    ({ input }) => availableDays(input.limit),
  ),

  /** Полный разбор одного дня: разрезы, факторы, сделки, дефекты входа. */
  day: base.input(dayInput).handler(({ input }) => dayStats(input.day ?? todayKey())),

  /** Шапка вкладки: сегодня, вчера, неделя и цель. */
  summary: base.handler(async () => {
    const today = kyivDay();
    const yesterday = shiftDay(today, -1);
    const week = Array.from({ length: 7 }, (_, i) => shiftDay(today, -i));
    const [todayTally, yesterdayTally, weekTally] = await Promise.all([
      rangeTally([today]),
      rangeTally([yesterday]),
      rangeTally(week),
    ]);
    return {
      today,
      yesterday,
      todayTally,
      yesterdayTally,
      weekTally,
      target: TARGET_WINRATE,
      reporterRunning: dailyReporterRunning(),
    };
  }),

  /** Сохранённый ежедневный отчёт, если он уже собран. */
  report: base.input(dayInput).handler(({ input }) => storedReport(input.day ?? todayKey())),

  /** Пересобрать отчёт за день по кнопке. Отчёт остаётся в дашборде. */
  rebuildReport: base.input(dayInput).handler(async ({ input }) => {
    const day = input.day ?? todayKey();
    const report = await generateDailyReport(day);
    return { day, summary: report.summary, analysis: report.analysis };
  }),
};
