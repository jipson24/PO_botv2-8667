/**
 * Доступ к переменным окружения через индекс — типы ProcessEnv в мобильном
 * пакете не знают про наши ключи, а точечный доступ ломает `tsc`.
 */
const bag = process.env as unknown as Record<string, string | undefined>;

export function envStr(key: string, fallback = ""): string {
  const value = bag[key];
  return value == null ? fallback : value.trim();
}

export function envFlag(key: string, fallback: boolean): boolean {
  const value = envStr(key);
  if (!value) return fallback;
  return value !== "0" && value.toLowerCase() !== "false";
}

/** Конструктор WebSocket, принимающий опции Bun/Node (headers). */
export type WsOptions = { headers?: Record<string, string> };
export const WS = WebSocket as unknown as new (url: string, options?: WsOptions) => WebSocket;
