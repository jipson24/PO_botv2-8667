/**
 * Сборка пакета для хостинга без Bun (панель Bot Manager UkrLine, любой VPS).
 *
 * На выходе `deploy/out/`:
 *   bot.js          — движок + HTTP, один бандл под Node (панель запускает этот файл)
 *   dist/           — собранный дашборд (статика)
 *   package.json    — только рантайм-зависимости, скрипт `npm start`
 *   .env.example    — какие переменные задать в Config Vars панели
 *   README.md       — как залить и запустить
 *
 * Запуск: `bun deploy/build.ts` из корня репозитория.
 */

import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const web = join(root, "packages/web");
const out = join(root, "deploy/out");

/**
 * Что не бандлим:
 *  - `@libsql/client` тянет нативный бинарник под платформу — его ставит npm на
 *    сервере, в бандл он не влезает;
 *  - `ws` — нативных зависимостей нет, но пусть ставится пакетом: под Node он
 *    выбирается динамическим import() в env.ts, и бандлер иначе подтянет его
 *    жёстко, сломав ветку для Bun.
 */
const external = ["@libsql/client", "ws"];

/** Версии берём из packages/web — чтобы на сервере встало ровно то же. */
const webPkg = JSON.parse(await Bun.file(join(web, "package.json")).text()) as {
  dependencies: Record<string, string>;
};
const runtimeDeps = Object.fromEntries(
  external.map((name) => [name, webPkg.dependencies[name] ?? "latest"]),
);

console.log("① собираю дашборд (vite build)…");
const build = Bun.spawnSync(["bunx", "vite", "build"], { cwd: web, stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) throw new Error("vite build упал");

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });

console.log("② бандлю сервер под Node…");
const bundle = await Bun.build({
  entrypoints: [join(web, "src/server-node.ts")],
  target: "node",
  format: "esm",
  minify: false,
  external,
  naming: "bot.js",
  outdir: out,
});
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log);
  throw new Error("bun build упал");
}

console.log("③ копирую статику…");
cpSync(join(web, "dist"), join(out, "dist"), { recursive: true });

writeFileSync(
  join(out, "package.json"),
  `${JSON.stringify(
    {
      name: "pocket-signal-bot",
      version: "1.0.0",
      private: true,
      type: "module",
      engines: { node: ">=20" },
      main: "bot.js",
      scripts: { start: "node bot.js" },
      dependencies: runtimeDeps,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(out, ".env.example"),
  `# Config Vars панели Bot Manager — по одной строке КЛЮЧ=значение.
# Обязательные
DATABASE_URL=libsql://...            # Turso, та же база — вся история сигналов в ней
DATABASE_AUTH_TOKEN=
TELEGRAM_BOT_TOKEN=
# POCKET_OPTION_SSID тут НЕ ставим: панель режет обратные слэши в Config Vars,
# а в кадре авторизации PO их 14 — сессия приезжает битой и брокер её молча отвергает.
# SSID живёт в БД: таблица settings, колонка po_ssid (см. «Замена SSID» в README).
POCKET_OPTION_UID=
# Необязательные
POCKET_OPTION_DEMO=0
POCKET_OPTION_UA=
TELEGRAM_DEFAULT_CHAT_ID=
OPS_TOKEN=                           # ≥24 символов; без него /api/ops/* выключен
ENGINE_ENABLED=1                     # 0 — процесс только отдаёт дашборд, сканер и бот не запускаются
PORT=3000
HOST=0.0.0.0
TZ=Europe/Kyiv
`,
);

writeFileSync(
  join(out, "README.md"),
  `# Pocket Signal Bot — пакет для хостинга

Собрано \`bun deploy/build.ts\`. Внутри: движок, Telegram-бот и дашборд в одном процессе Node.

## Установка

1. Залить содержимое этой папки в проект панели (GitHub-импорт или .zip).
2. Config Vars — заполнить по \`.env.example\`.
3. Установить зависимости (кнопка «Зависимости» / \`npm install\`).
4. Запуск: панель сама выполняет \`node bot.js\` (это её entrypoint для Node-проектов).

## Проверка

- \`GET /api/health\` → \`{"status":"ok"}\`
- Дашборд — корень \`/\`
- \`GET /api/ops/health\` с заголовком \`x-ops-token: $OPS_TOKEN\` → состояние фида, сканера, итоги дня

## Порт снаружи

Панель Bot Manager не открывает порты проектов наружу, и движку это не нужно:
Pocket Option, Telegram и Turso — исходящие соединения. Дашборд остаётся там,
где он был, и читает ту же базу Turso; на сервере он слушает только localhost.

## Замена SSID — только через БД, не через Config Vars

Панель Bot Manager режет обратные слэши в Config Vars. В кадре авторизации
Pocket Option их 14 (\`s:10:\\"session_id\\"\`), поэтому из env сессия приходит
битой: WebSocket открывается, кадр уходит, \`successauth\` не приходит, брокер
молчит и закрывается с кодом 1005. Проверено пробой с самого сервера.

Поэтому SSID хранится в БД — \`settings.po_ssid\`. Движок при старте берёт его
оттуда и он важнее env (\`api/engine/boot.ts\`). Два способа положить:

Порт открыт — на ходу, без перезапуска:

\`\`\`
curl -X POST http://СЕРВЕР:ПОРТ/api/ops/ssid \\
  -H "x-ops-token: $OPS_TOKEN" -H "content-type: application/json" \\
  -d '{"ssid":"42[\\"auth\\",{...}]"}'
\`\`\`

Порт закрыт — тем же запросом к дашборду, который смотрит в ту же базу Turso,
либо разово прямо в базу:

\`\`\`
turso db shell ИМЯ_БАЗЫ "update settings set po_ssid = '42[\\"auth\\",{...}]'"
\`\`\`

После записи — перезапустить проект в панели.
`,
);

const size = (p: string) => `${(statSync(p).size / 1024).toFixed(0)} КБ`;
console.log(`\nГотово: ${out}`);
console.log(`  bot.js       ${size(join(out, "bot.js"))}`);
console.log(`  dist/        ${Bun.spawnSync(["du", "-sh", join(out, "dist")]).stdout.toString().split("\t")[0]}`);
