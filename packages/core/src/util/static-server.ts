import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
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
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export interface StaticServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

/** Maps a request path into `root`, or null when it would escape it. */
export function resolveStaticPath(root: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const absoluteRoot = resolve(root);
  const candidate = normalize(join(absoluteRoot, decoded));
  if (candidate !== absoluteRoot && !candidate.startsWith(absoluteRoot + sep)) return null;
  return candidate;
}

/**
 * Zero-dependency static file server for originals that are plain HTML/JS. Binds to
 * loopback only, serves GET and HEAD, and never lists directories.
 */
export function serveStatic(root: string, port: number, host = "127.0.0.1"): Promise<StaticServer> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { allow: "GET, HEAD" }).end();
        return;
      }
      let path = resolveStaticPath(root, request.url ?? "/");
      if (path === null) {
        response.writeHead(400).end("bad path");
        return;
      }
      let info = await stat(path).catch(() => null);
      if (info?.isDirectory() === true) {
        path = join(path, "index.html");
        info = await stat(path).catch(() => null);
      }
      if (info === null || !info.isFile()) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
        "content-length": info.size,
        "cache-control": "no-store",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(path)
        .on("error", (error) => response.destroy(error))
        .pipe(response);
    })().catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolveServer({
        url: `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}/`,
        port: actualPort,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.closeAllConnections();
            server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
          }),
      });
    });
  });
}
