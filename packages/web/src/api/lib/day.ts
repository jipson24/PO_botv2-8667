/**
 * Торговый день — киевский, с 00:00 до 23:59 (UTC+3 летом, UTC+2 зимой).
 *
 * Границы считаются через IANA-зону, а не сдвигом на фиксированные три часа:
 * иначе в последнюю ночь октября сутки поехали бы на час, и вся статистика с
 * отчётами показывала бы сделки не того дня.
 */

export const TZ = "Europe/Kyiv";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Сдвиг киевской зоны относительно UTC в этот момент, в миллисекундах. */
function offsetMs(at: Date): number {
  const parts = PARTS_FMT.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** Дата в киевском дне: «2026-09-20». */
export function kyivDay(at: Date | number = new Date()): string {
  return DAY_FMT.format(typeof at === "number" ? new Date(at) : at);
}

/** Час киевского дня, 0–23. */
export function kyivHour(at: Date | number = new Date()): number {
  const d = typeof at === "number" ? new Date(at) : at;
  return Number(
    d.toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).slice(0, 2),
  ) % 24;
}

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** UTC-границы киевских суток: [00:00, следующий 00:00). */
export function kyivDayBounds(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const localMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
  const nextMidnight = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  // Сдвиг зависит от момента, поэтому берём его в первом приближении и уточняем.
  const startApprox = new Date(localMidnight - offsetMs(new Date(localMidnight)));
  const start = new Date(localMidnight - offsetMs(startApprox));
  const endApprox = new Date(nextMidnight - offsetMs(new Date(nextMidnight)));
  const end = new Date(nextMidnight - offsetMs(endApprox));
  return { start, end };
}

/** Соседний киевский день: shiftDay("2026-09-20", -1) → "2026-09-19". */
export function shiftDay(day: string, days: number): string {
  const { start } = kyivDayBounds(day);
  return kyivDay(new Date(start.getTime() + days * 86_400_000 + 12 * 3600_000));
}

/** Момент следующей киевской полуночи после `from`. */
export function nextMidnight(from: Date | number = new Date()): Date {
  const at = typeof from === "number" ? new Date(from) : from;
  const today = kyivDay(at);
  const { end } = kyivDayBounds(today);
  return end.getTime() > at.getTime() ? end : kyivDayBounds(shiftDay(today, 1)).end;
}

/** Список последних `count` киевских дней, свежий первым. */
export function recentDays(count: number, from: Date | number = new Date()): string[] {
  const out: string[] = [];
  let day = kyivDay(from);
  for (let i = 0; i < count; i++) {
    out.push(day);
    day = shiftDay(day, -1);
  }
  return out;
}
