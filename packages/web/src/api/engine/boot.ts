import { addSubscriber, getSettings } from "./store";
import { startScanner } from "./scanner";
import { startFeedAlerts } from "./feed-alerts";
import { startOutcomeResolver } from "./outcomes";
import { startDailyReporter } from "./daily-report";
import { botConfigured, sendMessage, startPolling } from "./telegram";
import { envStr } from "../env";

const FLAG = "__pocketSignalBotBooted";
const globalScope = globalThis as unknown as Record<string, boolean | undefined>;

/**
 * Единовременный запуск движка: сканер + Telegram long-polling.
 * Защищён флагом в globalThis, чтобы HMR Vite не поднимал вторую копию.
 */
export function boot() {
  if (globalScope[FLAG]) return;
  globalScope[FLAG] = true;

  void (async () => {
    try {
      const settings = await getSettings();

      if (botConfigured()) {
        startPolling();
        // Чат из .env подписываем только если бот реально может в него писать.
        const seed = envStr("TELEGRAM_DEFAULT_CHAT_ID");
        if (seed) {
          const ok = await sendMessage(
            seed,
            "♻️ <b>Pocket Signal Bot запущен</b>\nСканирую валютные пары Pocket Option. /help — команды.",
          );
          if (ok) await addSubscriber(seed, "Чат из .env");
          else console.warn(`[boot] чат ${seed} недоступен — нужен /start от пользователя`);
        }
      } else {
        console.warn("[boot] TELEGRAM_BOT_TOKEN не задан — рассылка выключена");
      }

      startFeedAlerts();
      startOutcomeResolver();
      startDailyReporter();
      startScanner(settings.scanIntervalSec);
    } catch (error) {
      globalScope[FLAG] = false;
      console.error("[boot] не удалось запустить движок:", (error as Error).message);
    }
  })();
}
