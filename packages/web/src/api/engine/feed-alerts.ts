/**
 * Алерт в Telegram про отвалившийся фид Pocket Option.
 *
 * Сессия PO — расходник: cookie `ssid` живёт несколько дней, и когда брокер
 * перестаёт его принимать, сканер тихо считает нули. Модуль следит за
 * состоянием фида и один раз на аварию пишет в чат, что нужно обновить сессию,
 * а после восстановления — что всё снова работает.
 *
 * Разрывы соединения у PO штатные (брокер сам рубит простаивающий сокет), и
 * авто-переподключение их закрывает за секунды. Поэтому «нет доступа»
 * (`unauthorized`) зовёт человека сразу, а «переподключается»/«ошибка» — только
 * если фид не поднялся за GRACE.
 */

import { feedState, watchFeedState, type FeedStateChange } from "../market/po-feed";
import { broadcast, TZ } from "./telegram";

/** Сколько терпим переподключение, прежде чем звать человека. */
const GRACE_MS = 180_000;
/** Пока фид лежит, напоминаем с этим интервалом: без него сигналов нет вообще. */
const REPEAT_MS = 60 * 60_000;
/** Частота проверки «сколько уже лежит». */
const CHECK_MS = 30_000;

type AlertState = {
  timer: ReturnType<typeof setInterval> | null;
  unwatch: (() => void) | null;
  /** Когда фид перестал быть живым. 0 — живой или ещё не поднимался. */
  downSince: number;
  /** Когда ушло последнее предупреждение. 0 — за эту аварию не писали. */
  notifiedAt: number;
};

/**
 * Состояние живёт в globalThis: HMR подменяет модуль, а таймер и «уже
 * предупредили» должны пережить подмену, иначе после каждой правки кода
 * пользователь получал бы алерт заново.
 */
const scope = globalThis as unknown as { __poFeedAlerts?: AlertState };

function stateOf(): AlertState {
  scope.__poFeedAlerts ??= { timer: null, unwatch: null, downSince: 0, notifiedAt: 0 };
  return scope.__poFeedAlerts;
}

const clock = () =>
  new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

function downMessage(note: string, downMs: number, repeat: boolean): string {
  return [
    repeat
      ? "🚨 <b>Сессия Pocket Option всё ещё не работает</b>"
      : "🚨 <b>Сессия Pocket Option отвалилась</b>",
    `Брокер не отдаёт котировки уже ${minutes(downMs)} мин — сигналы не считаются.`,
    ...(note ? [`Причина: ${note}`] : []),
    "",
    "<b>Что сделать:</b>",
    "1. Войти на pocketoption.com в том же браузере.",
    '2. DevTools → Network → WS → скопировать кадр <code>42["auth",{...}]</code> целиком.',
    "3. Обновить <code>POCKET_OPTION_SSID</code> и перезапустить бота.",
    "",
    `<i>${clock()} (Киев)</i>`,
  ].join("\n");
}

function upMessage(downMs: number): string {
  return [
    "✅ <b>Фид Pocket Option снова работает</b>",
    `Простой: ${minutes(downMs)} мин. Сканирование продолжается.`,
    `<i>${clock()} (Киев)</i>`,
  ].join("\n");
}

async function notify(text: string) {
  const sent = await broadcast(text);
  console.warn(`[feed-alerts] оповещение отправлено в ${sent} чат(ов)`);
}

/** Одна проверка: пора ли писать в чат. */
function check() {
  const st = stateOf();
  const feed = feedState();

  // `idle` — фид ещё не понадобился сканеру, это не авария.
  if (feed.state === "live" || feed.state === "idle") return;
  if (!st.downSince) st.downSince = Date.now();

  const downMs = Date.now() - st.downSince;
  const grace = feed.state === "unauthorized" ? 0 : GRACE_MS;

  if (!st.notifiedAt) {
    if (downMs < grace) return;
    st.notifiedAt = Date.now();
    void notify(downMessage(feed.note, downMs, false));
    return;
  }
  if (Date.now() - st.notifiedAt >= REPEAT_MS) {
    st.notifiedAt = Date.now();
    void notify(downMessage(feed.note, downMs, true));
  }
}

function onChange(change: FeedStateChange) {
  const st = stateOf();

  if (change.state === "live") {
    const downMs = st.downSince ? Date.now() - st.downSince : 0;
    const wasNotified = st.notifiedAt > 0;
    st.downSince = 0;
    st.notifiedAt = 0;
    if (wasNotified) void notify(upMessage(downMs));
    return;
  }
  if (change.state === "idle") {
    st.downSince = 0;
    return;
  }
  if (!st.downSince) st.downSince = Date.now();
  // «Нет доступа» ждать незачем: сессия уже мертва.
  if (change.state === "unauthorized") check();
}

/** Запустить наблюдение за фидом. Повторные вызовы безопасны. */
export function startFeedAlerts() {
  const st = stateOf();
  if (st.timer) clearInterval(st.timer);
  st.unwatch?.();

  st.unwatch = watchFeedState(onChange);
  st.timer = setInterval(check, CHECK_MS);
  console.log("[feed-alerts] следим за сессией Pocket Option");
}
