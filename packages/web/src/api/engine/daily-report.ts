/**
 * Ежедневный отчёт: разбор прошедших киевских суток.
 *
 * Считается по слепкам входа, а не по «ощущениям»: каждая сделка разбирается на
 * факторы, для каждого предложения считается, каким стал бы винрейт дня, если
 * применить фильтр. Цель — довести долю плюсовых сделок до 90%.
 *
 * Отчёт формируется дважды: в 00:03 по Киеву за прошедший день автоматически и
 * по запросу из дашборда (тогда строка в `daily_reports` перезаписывается).
 *
 * В Telegram отчёт не уходит — он живёт только во вкладке «Статистика».
 */

import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { kyivDay, nextMidnight, shiftDay } from "../lib/day";
import { TZ } from "./telegram";
import {
  type Bucket,
  type DayStats,
  type TradeRow,
  TARGET_WINRATE,
  dayStats,
  rangeTally,
} from "./stats";

/** Минимум сделок в разрезе, чтобы вывод не был случайным. */
const MIN_SAMPLE = 3;
/** Насколько винрейт сегмента должен отставать, чтобы его стоило резать. */
const LAG_PP = 15;

export interface Proposal {
  /** Короткая формулировка: что менять. */
  title: string;
  /** Цифры, на которых основано предложение. */
  evidence: string;
  /** Конкретное действие в настройках или в коде стратегии. */
  action: string;
  /** Винрейт дня, если бы фильтр уже работал. */
  winrateIfApplied: number | null;
  /** Сколько сделок отсеклось бы. */
  cuts: number;
}

export interface FaultStat {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winrate: number;
}

export interface DayAnalysis {
  day: string;
  headline: string;
  worked: string[];
  failed: string[];
  faults: FaultStat[];
  losses: {
    id: number;
    symbol: string;
    at: string;
    direction: string;
    confidence: number;
    move: string;
    causes: string[];
  }[];
  proposals: Proposal[];
  context: { last7Winrate: number; last7Trades: number };
}

const pct = (value: number) => `${value.toFixed(1)}%`;
const hhmm = (d: Date) =>
  d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

function winrateOf(trades: TradeRow[]): number {
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = trades.filter((t) => t.outcome === "loss").length;
  return wins + losses ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0;
}

/** Винрейт дня, если убрать сделки, попадающие под фильтр. */
function winrateWithout(trades: TradeRow[], drop: (t: TradeRow) => boolean) {
  const kept = trades.filter((t) => !drop(t));
  const cuts = trades.filter((t) => drop(t) && t.outcome !== "pending").length;
  const decided = kept.filter((t) => t.outcome === "win" || t.outcome === "loss").length;
  return { winrate: decided ? winrateOf(kept) : null, cuts, keptDecided: decided };
}

function faultStats(trades: TradeRow[]): FaultStat[] {
  const map = new Map<string, FaultStat>();
  for (const trade of trades) {
    if (trade.outcome !== "win" && trade.outcome !== "loss") continue;
    for (const label of trade.faults) {
      const entry = map.get(label) ?? { label, trades: 0, wins: 0, losses: 0, winrate: 0 };
      entry.trades += 1;
      if (trade.outcome === "win") entry.wins += 1;
      else entry.losses += 1;
      entry.winrate = Number(((entry.wins / entry.trades) * 100).toFixed(1));
      map.set(label, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.losses - a.losses || b.trades - a.trades);
}

function bestBuckets(list: Bucket[], overall: number): Bucket[] {
  return list
    .filter((b) => b.decided >= MIN_SAMPLE && b.winrate >= Math.max(overall, 60))
    .sort((a, b) => b.winrate - a.winrate || b.decided - a.decided)
    .slice(0, 4);
}

function worstBuckets(list: Bucket[], overall: number): Bucket[] {
  return list
    .filter((b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP)
    .sort((a, b) => a.winrate - b.winrate || b.decided - a.decided)
    .slice(0, 4);
}

function moveLabel(trade: TradeRow): string {
  if (trade.resultPrice == null || trade.moveAbs == null) return "цены экспирации нет";
  const sign = trade.moveAbs > 0 ? "+" : "";
  const atr = trade.moveAtr != null ? ` (${trade.moveAtr} ATR)` : "";
  return `${trade.price} → ${trade.resultPrice} · ${sign}${trade.moveAbs}${atr}`;
}

export function analyzeDay(stats: DayStats, context: DayAnalysis["context"]): DayAnalysis {
  const { tally, trades } = stats;
  const decided = trades.filter((t) => t.outcome === "win" || t.outcome === "loss");
  const overall = tally.winrate;
  const faults = faultStats(trades);

  const worked: string[] = [];
  const failed: string[] = [];

  for (const bucket of bestBuckets(stats.bySymbol, overall)) {
    worked.push(`${bucket.label}: ${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)})`);
  }
  for (const bucket of bestBuckets(stats.byTrigger, overall)) {
    worked.push(`триггер «${bucket.label}»: ${pct(bucket.winrate)} на ${bucket.decided} сделках`);
  }
  for (const bucket of bestBuckets(stats.byExpiry, overall)) {
    worked.push(`экспирация ${bucket.label}: ${pct(bucket.winrate)} на ${bucket.decided} сделках`);
  }
  for (const factor of stats.factors) {
    if (factor.decided >= MIN_SAMPLE && factor.winrate >= Math.max(overall + 10, 70)) {
      worked.push(`фактор «${factor.label}»: ${pct(factor.winrate)} на ${factor.decided} сделках`);
    }
  }

  for (const bucket of worstBuckets(stats.bySymbol, overall)) {
    failed.push(`${bucket.label}: ${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)})`);
  }
  for (const bucket of worstBuckets(stats.byHour, overall)) {
    failed.push(`час ${bucket.label}: ${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)})`);
  }
  for (const bucket of worstBuckets(stats.byConfidence, overall)) {
    failed.push(`уверенность ${bucket.label}: ${pct(bucket.winrate)} на ${bucket.decided} сделках`);
  }
  for (const bucket of worstBuckets(stats.byTrigger, overall)) {
    failed.push(`триггер «${bucket.label}»: ${pct(bucket.winrate)} на ${bucket.decided} сделках`);
  }
  for (const factor of stats.factors) {
    if (factor.decided >= MIN_SAMPLE && factor.winrate <= overall - LAG_PP) {
      failed.push(`фактор «${factor.label}»: ${pct(factor.winrate)} на ${factor.decided} сделках`);
    }
  }

  const losses = trades
    .filter((t) => t.outcome === "loss")
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      at: hhmm(t.entryAt),
      direction: t.direction,
      confidence: t.confidence,
      move: moveLabel(t),
      causes: t.faults.length ? t.faults : ["явных дефектов входа нет — рынок ушёл против"],
    }));

  const proposals = buildProposals(stats, decided, faults);

  const headline = tally.decided
    ? `${tally.wins} в плюс · ${tally.losses} в минус · винрейт ${pct(overall)} · итог ${
        tally.netPct > 0 ? "+" : ""
      }${tally.netPct}% ставки`
    : tally.trades
      ? `${tally.trades} сделок, результат ещё не определён`
      : "сделок не было";

  return { day: stats.day, headline, worked, failed, faults, losses, proposals, context };
}

function buildProposals(
  stats: DayStats,
  decided: TradeRow[],
  faults: FaultStat[],
): Proposal[] {
  const out: Proposal[] = [];
  const overall = stats.tally.winrate;
  const push = (
    title: string,
    evidence: string,
    action: string,
    drop: (t: TradeRow) => boolean,
  ) => {
    const { winrate, cuts, keptDecided } = winrateWithout(stats.trades, drop);
    // Фильтр, после которого не остаётся сделок, — не улучшение, а остановка.
    if (winrate == null || keptDecided < 2 || winrate <= overall) return;
    out.push({ title, evidence, action, winrateIfApplied: winrate, cuts });
  };

  // 1. Порог уверенности: где именно ломается качество.
  const weakConf = stats.byConfidence
    .filter((b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP)
    .sort((a, b) => a.key.localeCompare(b.key));
  const cut = weakConf.at(-1);
  if (cut) {
    const threshold = Number(cut.key) + 5;
    push(
      `Поднять порог уверенности до ${threshold}%`,
      `в диапазоне ${cut.label} винрейт ${pct(cut.winrate)} против ${pct(overall)} по дню`,
      `minConfidence = ${threshold} в настройках движка`,
      (t) => t.confidence < threshold,
    );
  }

  // 2. Пары, которые весь день отдавали минус.
  for (const bucket of stats.bySymbol.filter(
    (b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP,
  )) {
    push(
      `Убрать ${bucket.label} из watchlist на день`,
      `${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)}), итог ${bucket.netPct}% ставки`,
      `исключить ${bucket.key} до пересмотра — пара не отрабатывает сетапы`,
      (t) => t.symbol === bucket.key,
    );
  }

  // 3. Часы: тонкий рынок ломает винрейт чаще всего.
  const badHours = stats.byHour
    .filter((b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP)
    .map((b) => Number(b.key));
  if (badHours.length) {
    const list = badHours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ");
    push(
      `Не входить в часы ${list}`,
      badHours
        .map((h) => {
          const b = stats.byHour.find((x) => Number(x.key) === h)!;
          return `${String(h).padStart(2, "0")}:00 — ${pct(b.winrate)} (${b.decided})`;
        })
        .join(" · "),
      "добавить окно тишины в расписание сканера",
      (t) => badHours.includes(t.kyivHour),
    );
  }

  // 4. Экспирации.
  for (const bucket of stats.byExpiry.filter(
    (b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP,
  )) {
    push(
      `Отказаться от экспирации ${bucket.label}`,
      `${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)})`,
      `исключить ${bucket.label} из списка экспираций для текущей волатильности`,
      (t) => String(t.expirySeconds).padStart(4, "0") === bucket.key,
    );
  }

  // 5. Дефекты входа: режем те, что статистически ведут в минус.
  for (const fault of faults) {
    if (fault.trades < MIN_SAMPLE || fault.winrate > overall - LAG_PP) continue;
    push(
      `Блокировать вход: ${fault.label}`,
      `${fault.wins}/${fault.trades} (${pct(fault.winrate)}) при этом условии`,
      "добавить в blockers стратегии — сигнал не публикуется",
      (t) => t.faults.includes(fault.label),
    );
  }

  // 6. Контрфакторы: слабый перевес голосов.
  const thinMargin = decided.filter((t) => t.margin != null && t.margin < 0.2);
  if (thinMargin.length >= MIN_SAMPLE && winrateOf(thinMargin) <= overall - LAG_PP) {
    push(
      "Требовать перевес голосов ≥ 20%",
      `при перевесе <20% винрейт ${pct(winrateOf(thinMargin))} на ${thinMargin.length} сделках`,
      "добавить проверку margin в analyze(): ниже 0.2 — блокер",
      (t) => t.margin != null && t.margin < 0.2,
    );
  }

  // 7. Направление: односторонний рынок.
  for (const bucket of stats.byDirection.filter(
    (b) => b.decided >= MIN_SAMPLE && b.winrate <= overall - LAG_PP,
  )) {
    push(
      `Приостановить ${bucket.label}`,
      `${bucket.wins}/${bucket.decided} (${pct(bucket.winrate)}) — рынок шёл в одну сторону`,
      `не публиковать ${bucket.key}, пока 30m bias не развернётся`,
      (t) => t.direction === bucket.key,
    );
  }

  // Сначала то, что сильнее поднимает винрейт при меньшем числе отсечений.
  out.sort(
    (a, b) =>
      (b.winrateIfApplied ?? 0) - (a.winrateIfApplied ?? 0) || a.cuts - b.cuts,
  );

  const best = out[0];
  if (best && (best.winrateIfApplied ?? 0) < TARGET_WINRATE && stats.tally.decided >= 5) {
    out.push({
      title: `До ${TARGET_WINRATE}% одним фильтром не дойти`,
      evidence: `лучший из фильтров даёт ${pct(best.winrateIfApplied ?? 0)} на ${
        stats.tally.decided - best.cuts
      } сделках`,
      action:
        "комбинировать: порог уверенности + запрет входов против 30m тренда + отказ от ночных часов; после смены параметров сравнивать дни, а не отдельные сделки",
      winrateIfApplied: null,
      cuts: 0,
    });
  }

  return out.slice(0, 8);
}

/** Полный текст отчёта для дашборда. */
export function renderReport(stats: DayStats, analysis: DayAnalysis): string {
  const t = stats.tally;
  const lines: string[] = [];
  const L = (s = "") => lines.push(s);

  L(`Отчёт за ${analysis.day} (киевские сутки)`);
  L(analysis.headline);
  L();
  L("── Итоги ──");
  L(`Сделок: ${t.trades} · закрыто: ${t.decided} · ждут экспирации: ${t.pending}`);
  L(`Плюс: ${t.wins} · минус: ${t.losses}${t.draws ? ` · возврат: ${t.draws}` : ""}${
    t.unknown ? ` · без данных: ${t.unknown}` : ""
  }`);
  L(`Винрейт: ${pct(t.winrate)} (цель ${TARGET_WINRATE}%) · итог: ${t.netPct > 0 ? "+" : ""}${t.netPct}% ставки`);
  L(`Серии: подряд в плюс ${stats.bestWinStreak} · подряд в минус ${stats.worstLossStreak}`);
  L(
    `За 7 дней: ${pct(analysis.context.last7Winrate)} на ${analysis.context.last7Trades} сделках`,
  );
  if (stats.trades.length && stats.snapshots < stats.trades.length) {
    L(`Слепки входа есть у ${stats.snapshots} из ${stats.trades.length} сделок`);
  }

  L();
  L("── Сделки по порядку ──");
  if (!stats.trades.length) L("сделок не было");
  for (const trade of stats.trades) {
    const mark =
      trade.outcome === "win"
        ? "🟢"
        : trade.outcome === "loss"
          ? "🔴"
          : trade.outcome === "draw"
            ? "⚪"
            : trade.outcome === "pending"
              ? "⏳"
              : "❔";
    L(
      `${mark} ${hhmm(trade.entryAt)} ${trade.symbol} ${trade.direction.toUpperCase()} · ` +
        `уверенность ${trade.confidence}% · payout ${trade.payout}% · ${
          trade.expirySeconds % 60 === 0 ? `${trade.expirySeconds / 60} мин` : `${trade.expirySeconds} сек`
        }`,
    );
    L(`   ${moveLabel(trade)}`);
    const snapLine = [
      trade.margin != null ? `перевес ${Math.round(trade.margin * 100)}%` : null,
      trade.atrPct != null ? `ATR ${trade.atrPct}%` : null,
      trade.rsi5 != null ? `RSI ${trade.rsi5}` : null,
      trade.levelAheadAtr != null ? `уровень в ${trade.levelAheadAtr} ATR` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (snapLine) L(`   ${snapLine}`);
    L(`   30m: ${trade.biasH30} | 15m: ${trade.biasM15} | 5m: ${trade.triggerM5}`);
    if (trade.faults.length) L(`   дефекты: ${trade.faults.join("; ")}`);
  }

  L();
  L("── Что работало ──");
  if (!analysis.worked.length) L("устойчивых плюсовых закономерностей не набралось");
  for (const item of analysis.worked) L(`+ ${item}`);

  L();
  L("── Что подводило ──");
  if (!analysis.failed.length) L("выраженных проблемных разрезов нет");
  for (const item of analysis.failed) L(`− ${item}`);

  if (analysis.losses.length) {
    L();
    L("── Разбор убытков ──");
    for (const loss of analysis.losses) {
      L(`🔴 ${loss.at} ${loss.symbol} ${loss.direction.toUpperCase()} (${loss.confidence}%)`);
      L(`   ${loss.move}`);
      for (const cause of loss.causes) L(`   • ${cause}`);
    }
  }

  if (analysis.faults.length) {
    L();
    L("── Дефекты входа: как отрабатывают ──");
    for (const fault of analysis.faults) {
      L(`${fault.label}: ${fault.wins}/${fault.trades} (${pct(fault.winrate)})`);
    }
  }

  L();
  L(`── Что менять (цель ${TARGET_WINRATE}%) ──`);
  if (!analysis.proposals.length) L("данных дня не хватает на обоснованное изменение параметров");
  analysis.proposals.forEach((p, i) => {
    L(`${i + 1}. ${p.title}`);
    L(`   основание: ${p.evidence}`);
    L(`   действие: ${p.action}`);
    if (p.winrateIfApplied != null) {
      L(`   винрейт дня с этим фильтром: ${pct(p.winrateIfApplied)} (отсеклось ${p.cuts})`);
    }
  });

  return lines.join("\n");
}

export interface GeneratedReport {
  day: string;
  stats: DayStats;
  analysis: DayAnalysis;
  summary: string;
}

/** Посчитать и сохранить отчёт за день. Повторный вызов перезаписывает строку. */
export async function generateDailyReport(day: string): Promise<GeneratedReport> {
  const stats = await dayStats(day);
  const week = await rangeTally(Array.from({ length: 7 }, (_, i) => shiftDay(day, -i)));
  const analysis = analyzeDay(stats, {
    last7Winrate: week.winrate,
    last7Trades: week.decided,
  });
  const summary = renderReport(stats, analysis);

  const row = {
    day,
    trades: stats.tally.trades,
    wins: stats.tally.wins,
    losses: stats.tally.losses,
    draws: stats.tally.draws,
    pending: stats.tally.pending,
    winrate: stats.tally.winrate,
    bestWinStreak: stats.bestWinStreak,
    worstLossStreak: stats.worstLossStreak,
    analysis,
    summary,
    sentToTelegram: false,
    generatedAt: new Date(),
  };

  await db
    .insert(schema.dailyReports)
    .values(row)
    .onConflictDoUpdate({ target: schema.dailyReports.day, set: row });

  return { day, stats, analysis, summary };
}

export async function storedReport(day: string) {
  const [row] = await db
    .select()
    .from(schema.dailyReports)
    .where(eq(schema.dailyReports.day, day));
  return row ?? null;
}

interface ReporterState {
  timer: ReturnType<typeof setTimeout> | null;
}

/** Таймер в globalThis: HMR не должен поднимать второй отчёт. */
const scope = globalThis as unknown as { __poDailyReport?: ReporterState };
const state: ReporterState = (scope.__poDailyReport ??= { timer: null });

/** Через три минуты после полуночи: за это время резолвер закрывает последние сделки. */
const AFTER_MIDNIGHT_MS = 3 * 60_000;

function schedule() {
  if (state.timer) clearTimeout(state.timer);
  const at = nextMidnight().getTime() + AFTER_MIDNIGHT_MS;
  state.timer = setTimeout(() => void fire(), Math.max(1000, at - Date.now()));
}

async function fire() {
  const day = shiftDay(kyivDay(), -1);
  try {
    const report = await generateDailyReport(day);
    console.log(
      `[report] ${day}: ${report.stats.tally.wins}/${report.stats.tally.decided} в плюс · ` +
        `винрейт ${report.stats.tally.winrate}% · предложений ${report.analysis.proposals.length}`,
    );
  } catch (error) {
    console.error(`[report] ${day}: не удалось собрать отчёт —`, (error as Error).message);
  } finally {
    schedule();
  }
}

export function startDailyReporter() {
  if (state.timer) return;
  schedule();
  const at = new Date(nextMidnight().getTime() + AFTER_MIDNIGHT_MS);
  console.log(`[report] ежедневный разбор: следующий в ${hhmm(at)} по Киеву`);
}

export function dailyReporterRunning(): boolean {
  return state.timer !== null;
}
