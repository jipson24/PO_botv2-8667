/**
 * Точка входа под Node.js — для хостинга, где нет Bun (панель Bot Manager
 * UkrLine, обычный VPS, любой Node ≥ 20).
 *
 * Отличия от `__server.ts` (Bun):
 *  - HTTP отдаёт `@hono/node-server` вместо `Bun.serve`;
 *  - статика читается через `node:fs` вместо `Bun.file`;
 *  - движок (сканер, Telegram, отчёты) поднимается тем же `./api` — логика
 *    полностью общая, отдельной копии нет.
 *
 * Запуск: `node server.mjs` рядом с папкой `dist/` (см. deploy/README.md).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import app from "./api";

const here = dirname(fileURLToPath(import.meta.url));
/** В собранном виде server.mjs лежит рядом с dist/, в исходниках — на уровень выше. */
const distDir = existsSync(join(here, "dist/index.html"))
  ? resolve(join(here, "dist"))
  : resolve(join(here, "../dist"));
const indexPath = join(distDir, "index.html");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function mimeOf(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

/** Путь внутри dist/ без выхода за его пределы. */
function staticPath(pathname: string): string | null {
  let clean: string;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  clean = normalize(clean).replace(/^([/\\]|\.\.)+/, "");
  if (!clean) return null;
  const full = resolve(join(distDir, clean));
  if (full !== distDir && !full.startsWith(distDir + "/")) return null;
  return full;
}

function fileResponse(path: string): Response {
  const body = readFileSync(path);
  const immutable = path.includes("/assets/");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeOf(path),
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

serve(
  {
    port,
    hostname: host,
    fetch: async (request: Request) => {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api")) return app.fetch(request);

      const filePath = staticPath(url.pathname);
      if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
        return fileResponse(filePath);
      }

      // SPA: любой неизвестный путь отдаёт index.html.
      if (existsSync(indexPath)) {
        return new Response(readFileSync(indexPath), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
        });
      }

      return new Response("Сборка не найдена: нет dist/index.html", {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    },
  },
  (info) => {
    console.log(`[server] Node ${process.version} слушает http://${host}:${info.port}`);
    console.log(`[server] статика: ${distDir}`);
  },
);

// Аварии не должны валить процесс: движок переживает отказ фида и переподключается.
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[server] uncaughtException:", error);
});
