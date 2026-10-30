import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary"
};

function targetFor(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(root, `.${decoded}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (!existsSync(candidate)) return null;
  const stats = statSync(candidate);
  if (stats.isDirectory()) {
    const index = resolve(candidate, "index.html");
    return existsSync(index) ? index : null;
  }
  return candidate;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname = "/";
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  let file = targetFor(pathname);
  if (!file && !extname(pathname)) file = resolve(root, "index.html");
  if (!file || !existsSync(file)) {
    if (request.method === "HEAD") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const stats = statSync(file);
  const type = mime[extname(file).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stats.size,
    "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Luma listening on http://${host}:${port} from ${root}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
