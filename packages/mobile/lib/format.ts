/** Форматтеры терминала: время, цены, длительности. */

export function timeHM(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function timeHMS(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function dateShort(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function expiryLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} мин`;
  return `${seconds} сек`;
}

export function price(value: number): string {
  const digits = Math.abs(value) >= 20 ? 3 : 5;
  return value.toFixed(digits);
}

/** «через 4:12» / «истёк» для активного сигнала. */
export function countdown(expiresAt: string | number | Date, now = Date.now()): string {
  const target = new Date(expiresAt).getTime();
  const diff = Math.round((target - now) / 1000);
  if (diff <= 0) return "истёк";
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function agoLabel(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const diff = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return `${diff} с назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86_400)} дн назад`;
}

export function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}
