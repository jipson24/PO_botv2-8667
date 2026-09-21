/**
 * Одноразовая проба с хоста UkrLine: пускает ли Pocket Option сессию с этого IP.
 *
 * Панель запускает проект как `node bot.js`, поэтому проба заливается вместо
 * bot.js, отрабатывает ~40 секунд и пишет всё в логи проекта. После неё
 * возвращается настоящая сборка.
 *
 * Что выясняем по шагам:
 *  1. исходящий IP этого сервера (его видит брокер);
 *  2. доступен ли вообще pocketoption.com по HTTPS (не блокирует ли хостинг);
 *  3. поднимается ли WebSocket и что брокер отвечает на кадр авторизации:
 *     `successauth` — сессия принята, дело не в IP;
 *     тишина / закрытие — сессия отвергнута с этого адреса.
 */

/** SSID берём из БД, если в env его нет: панель режет обратные слэши. */
async function ssidFromDb() {
  if (!process.env.DATABASE_URL) return "";
  try {
    const { createClient } = await import("@libsql/client");
    const c = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
    const r = await c.execute("select po_ssid from settings limit 1");
    return String(r.rows[0]?.po_ssid || "");
  } catch (e) {
    console.log("[проба] БД недоступна:", e.message);
    return "";
  }
}

const UA =
  process.env.POCKET_OPTION_UA ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
let SSID = process.env.POCKET_OPTION_SSID || "";
let ssidSource = SSID ? "env" : "";
const DEMO = (process.env.POCKET_OPTION_DEMO || "0") !== "0";
const WS_URL = DEMO
  ? "wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket"
  : "wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket";

const log = (...a) => console.log("[проба]", ...a);

async function outboundIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    return d.ip;
  } catch (e) {
    return `не узнал (${e.message})`;
  }
}

async function httpsReach(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    return `HTTP ${r.status}`;
  } catch (e) {
    return `ошибка: ${e.message}`;
  }
}

async function main() {
  log("Node", process.version);
  if (!SSID) {
    SSID = await ssidFromDb();
    if (SSID) ssidSource = "БД (settings.po_ssid)";
  }
  log("SSID задан:", SSID ? `да, ${SSID.length} символов, источник: ${ssidSource}` : "НЕТ");
  log("обратных слэшей в SSID:", (SSID.match(/\\/g) || []).length);
  log("режим:", DEMO ? "demo" : "live", "| url:", WS_URL);
  log("исходящий IP:", await outboundIp());
  log("pocketoption.com:", await httpsReach("https://pocketoption.com/"));
  log("api-eu.po.market:", await httpsReach("https://api-eu.po.market/socket.io/?EIO=4&transport=polling"));

  if (!SSID) {
    log("без SSID дальше смысла нет");
    return;
  }

  const { WebSocket } = await import("ws");
  const ws = new WebSocket(WS_URL, {
    headers: { Origin: "https://pocketoption.com", "User-Agent": UA },
  });
  ws.binaryType = "arraybuffer";

  let authSent = false;
  let authOk = false;
  const started = Date.now();
  const since = () => `${((Date.now() - started) / 1000).toFixed(1)}с`;

  ws.on("open", () => log(since(), "WS открыт — рукопожатие прошло"));

  ws.on("message", (data, isBinary) => {
    const text = isBinary ? Buffer.from(data).toString("utf8") : data.toString();
    const short = text.length > 200 ? `${text.slice(0, 200)}…` : text;

    if (text.startsWith("0{")) {
      log(since(), "привет от сервера:", short);
      ws.send("40");
      return;
    }
    if (text === "2") {
      ws.send("3");
      return;
    }
    if (text.startsWith("40")) {
      log(since(), "namespace подключён, отправляю авторизацию");
      ws.send(SSID);
      authSent = true;
      return;
    }
    if (text.includes("successauth")) {
      authOk = true;
      log(since(), "✅ successauth — брокер ПРИНЯЛ сессию с этого IP");
      return;
    }
    if (text.includes("auth") || text.includes("error") || text.includes("Error")) {
      log(since(), "ответ про авторизацию:", short);
      return;
    }
    if (authSent && !authOk) log(since(), "кадр:", short);
  });

  ws.on("close", (code, reason) => {
    log(since(), `WS закрыт: код ${code} ${reason ? `(${reason})` : ""}`);
    verdict(authSent, authOk);
    process.exit(0);
  });

  ws.on("error", (e) => log(since(), "ошибка WS:", e.message));

  setTimeout(() => {
    verdict(authSent, authOk);
    try {
      ws.close();
    } catch {}
    process.exit(0);
  }, 40000);
}

function verdict(authSent, authOk) {
  if (authOk) {
    log("ВЫВОД: сессия рабочая с этого сервера — проблема была не в IP");
  } else if (authSent) {
    log("ВЫВОД: кадр авторизации ушёл, но successauth не пришёл — брокер отверг сессию с этого IP, нужен свежий SSID");
  } else {
    log("ВЫВОД: до авторизации не дошло — брокер или хостинг рубят соединение");
  }
}

main().catch((e) => {
  log("проба упала:", e.stack || e.message);
  process.exit(1);
});
