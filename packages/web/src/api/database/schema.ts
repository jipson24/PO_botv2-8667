import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/** Активы Pocket Option с payout — обновляются из WS-фида брокера. */
export const assets = sqliteTable(
  "assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull().unique(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    isOtc: integer("is_otc", { mode: "boolean" }).notNull().default(false),
    payout: integer("payout").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    feedSymbol: text("feed_symbol"),
    feedStatus: text("feed_status").notNull().default("unknown"),
    lastCandleAt: integer("last_candle_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("assets_payout_idx").on(t.payout)],
);

/** Сформированные сигналы. */
export const signals = sqliteTable(
  "signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    assetName: text("asset_name").notNull(),
    direction: text("direction").notNull(),
    confidence: integer("confidence").notNull(),
    score: real("score").notNull(),
    payout: integer("payout").notNull().default(0),
    /** payout вне диапазона minPayout–maxPayout: сигнал отправляем, но помечаем. */
    lowPayout: integer("low_payout", { mode: "boolean" }).notNull().default(false),
    price: real("price").notNull(),
    expirySeconds: integer("expiry_seconds").notNull(),
    entryAt: integer("entry_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    biasH30: text("bias_h30").notNull(),
    biasM15: text("bias_m15").notNull(),
    triggerM5: text("trigger_m5").notNull(),
    reasons: text("reasons", { mode: "json" }).notNull(),
    details: text("details", { mode: "json" }).notNull(),
    outcome: text("outcome").notNull().default("pending"),
    resultPrice: real("result_price"),
    sentToTelegram: integer("sent_to_telegram", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("signals_created_idx").on(t.createdAt),
    index("signals_symbol_idx").on(t.symbol),
  ],
);

/** Подписчики Telegram. */
export const subscribers = sqliteTable("subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull().unique(),
  title: text("title"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Настройки движка — одна строка с id = 1. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  minConfidence: integer("min_confidence").notNull().default(80),
  scanIntervalSec: integer("scan_interval_sec").notNull().default(60),
  minPayout: integer("min_payout").notNull().default(82),
  maxPayout: integer("max_payout").notNull().default(92),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(15),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(true),
  /** Пока OTC заблокированы (нет cookie ssid) — сканировать обычные пары с публичным фидом. */
  fallbackPairs: integer("fallback_pairs", { mode: "boolean" }).notNull().default(true),
  scannerEnabled: integer("scanner_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Журнал проходов сканера — для /status и диагностики. */
export const scanRuns = sqliteTable("scan_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  scanned: integer("scanned").notNull(),
  signalsFound: integer("signals_found").notNull(),
  errors: integer("errors").notNull().default(0),
  note: text("note"),
});
