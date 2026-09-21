/**
 * Доступ к переменным окружения через индекс — типы ProcessEnv в мобильном
 * пакете не знают про наши ключи, а точечный доступ ломает `tsc`.
 */
const bag = process.env as unknown as Record<string, string | undefined>;

/**
 * Значения, заданные на ходу — поверх .env и без перезапуска процесса.
 *
 * Нужно на хостинге: SSID Pocket Option привязан к IP и User-Agent и живёт
 * недолго, а править .env и пересобирать образ ради одной строки нельзя.
 * Новый SSID приходит в `/api/ops/ssid`, ложится сюда и в БД, а все чтения
 * `envStr("POCKET_OPTION_SSID")` ленивые — подхватывают сразу.
 */
const overrides = new Map<string, string>();

export function setEnvOverride(key: string, value: string | null): void {
  if (value == null || value.trim() === "") overrides.delete(key);
  else overrides.set(key, value.trim());
}

export function envOverridden(key: string): boolean {
  return overrides.has(key);
}

export function envStr(key: string, fallback = ""): string {
  const override = overrides.get(key);
  if (override != null) return override;
  const value = bag[key];
  return value == null ? fallback : value.trim();
}

export function envFlag(key: string, fallback: boolean): boolean {
  const value = envStr(key);
  if (!value) return fallback;
  return value !== "0" && value.toLowerCase() !== "false";
}

/**
 * Движок (сканер, Telegram, отчёты) поднимается только там, где это разрешено.
 *
 * Нужно, если дашборд и движок живут на разных машинах: копии движка пишут в
 * одну базу Turso, и вторая дублировала бы сигналы и рассылку. На дашборде
 * ставим `ENGINE_ENABLED=0` — он остаётся читающим, а сканирует только хост
 * движка. По умолчанию включён: одиночная установка работает как раньше.
 */
export function engineEnabled(): boolean {
  return envFlag("ENGINE_ENABLED", true);
}

/** Конструктор WebSocket, принимающий опции Bun/Node (headers). */
export type WsOptions = { headers?: Record<string, string> };
type WsCtor = new (url: string, options?: WsOptions) => WebSocket;

/**
 * Pocket Option авторизует сессию по заголовкам `Origin` и `User-Agent`, а
 * глобальный WebSocket в Node их молча игнорирует (undici не принимает опции).
 * Поэтому под Node берём пакет `ws`: он даёт заголовки и тот же API событий
 * (`addEventListener`, `event.data`, `binaryType`). В Bun остаётся встроенный —
 * он заголовки поддерживает сам.
 */
const isBun = typeof (globalThis as unknown as { Bun?: unknown }).Bun !== "undefined";

async function resolveWs(): Promise<WsCtor> {
  if (isBun) return WebSocket as unknown as WsCtor;
  const mod = (await import("ws")) as unknown as { WebSocket?: WsCtor; default?: WsCtor };
  const impl = mod.WebSocket ?? mod.default;
  if (!impl) throw new Error("пакет ws не найден — установите зависимости");
  return impl;
}

export const WS: WsCtor = await resolveWs();
