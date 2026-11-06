import http from "node:http";
import https from "node:https";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

export function createAppServer({ apiTarget = process.env.API_TARGET || "http://127.0.0.1:5199" } = {}) {
  const target = new URL(apiTarget);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("API_TARGET must be HTTP(S)");
  const transport = target.protocol === "https:" ? https : http;

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
      pathname = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400).end("Bad URL");
      return;
    }

    if (pathname.startsWith("/api/")) {
      const upstreamUrl = new URL(req.url, target);
      const headers = { ...req.headers, host: target.host };
      delete headers.connection;
      const upstream = transport.request(upstreamUrl, {
        method: req.method,
        headers,
        timeout: 110_000
      }, (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      });
      upstream.on("timeout", () => upstream.destroy(new Error("API timeout")));
      upstream.on("error", (error) => {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ detail: "API-yə qoşulmaq olmadı: " + error.message }));
        } else {
          res.destroy(error);
        }
      });
      req.pipe(upstream);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end("Method not allowed");
      return;
    }

    const filePath = path.resolve(publicDir, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!filePath.startsWith(publicDir + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
      res.writeHead(200, {
        "content-type": mime[path.extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  server.requestTimeout = 120_000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log("AiTeacher Test UI: http://localhost:" + port);
    console.log("API proxy target: " + (process.env.API_TARGET || "http://127.0.0.1:5199"));
  });
}
