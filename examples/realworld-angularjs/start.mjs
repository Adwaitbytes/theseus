#!/usr/bin/env node
// Starts the RealWorld "Conduit" original from a fixed seed:
//   backend  (Moleculer + NeDB, vendored)        http://localhost:4180/api
//   frontend (AngularJS 1.x, prebuilt, vendored)  http://localhost:4171
//
//   node start.mjs           reseed, start both, print a ready line, run until Ctrl-C
//   node start.mjs --reset   reseed the running instance (POST /__theseus/reset), or the
//                            data files when nothing is running, then exit
//
// The frontend bundle has the API origin compiled in, so both ports are fixed. The backend itself
// listens on 4181 behind a small proxy on 4180: moleculer-web 0.6 only answers CORS preflights for
// routes with an OPTIONS alias, so a cross-origin POST from 4171 would otherwise be blocked. The
// proxy also reshapes 422 bodies from {"errors":{"email":"is invalid"}} to the RealWorld spec's
// {"errors":{"email":["is invalid"]}}, the shape the AngularJS error list iterates over.
import { spawn } from "node:child_process";
import { existsSync, openSync, closeSync, mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, request } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSeed } from "./seed/seed.mjs";

const FRONTEND_PORT = 4171;
const API_PORT = 4180;
const BACKEND_PORT = 4181;
const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${API_PORT}/api`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/api`;
const RESET_PATH = "/__theseus/reset";
const AVATAR_PREFIX = "/__theseus/avatars/";
const BACKEND_READY_TIMEOUT_MS = 30_000;

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, "original", "backend");
const dataDir = join(backendDir, "data");
const frontendBuild = join(here, "original", "frontend", "build");
const avatarsDir = join(here, "seed", "avatars");
const runtimeDir = join(here, ".runtime");
const backendLog = join(runtimeDir, "backend.log");
const compatShim = join(here, "seed", "node-util-compat.cjs");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`realworld-angularjs: ${message}`);
  process.exit(1);
}

async function isListening(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

async function ensureBackendDependencies() {
  if (existsSync(join(backendDir, "node_modules", "moleculer"))) return;
  console.log("realworld-angularjs: installing backend dependencies (npm ci, first run only)");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["ci", "--omit=dev", "--no-audit", "--no-fund"], backendDir);
}

/** Owns the backend process so a reset can stop it, rewrite the seed and start it again. */
class Backend {
  #child = null;
  #stopping = false;

  async start() {
    mkdirSync(runtimeDir, { recursive: true });
    const log = openSync(backendLog, "a");
    const runner = join(backendDir, "node_modules", "moleculer", "bin", "moleculer-runner.js");
    const child = spawn(process.execPath, ["--require", compatShim, runner, "services"], {
      cwd: backendDir,
      env: { ...process.env, PORT: String(BACKEND_PORT) },
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    this.#child = child;
    child.on("exit", (code, signal) => {
      if (this.#child !== child) return;
      this.#child = null;
      if (!this.#stopping) fail(`backend exited unexpectedly (code ${code}, signal ${signal}); see ${backendLog}`);
    });
    await this.#waitUntilReady();
  }

  async #waitUntilReady() {
    const deadline = Date.now() + BACKEND_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BACKEND_URL}/tags`, { signal: AbortSignal.timeout(1_000) });
        if (res.ok) return;
      } catch {
        // Not listening yet.
      }
      await sleep(150);
    }
    throw new Error(`backend did not answer ${BACKEND_URL}/tags within ${BACKEND_READY_TIMEOUT_MS} ms; see ${backendLog}`);
  }

  async stop() {
    const child = this.#child;
    if (child === null) return;
    this.#stopping = true;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const forced = setTimeout(() => child.kill("SIGKILL"), 5_000);
    await exited;
    clearTimeout(forced);
    this.#child = null;
    this.#stopping = false;
  }
}

async function serveFile(res, root, relativePath) {
  const file = normalize(join(root, relativePath));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  res.end(await readFile(file));
}

function startFrontend(reset) {
  const server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? "/", FRONTEND_ORIGIN);
      if (pathname === RESET_PATH) {
        if (req.method !== "POST") {
          res.writeHead(405, { allow: "POST" }).end();
          return;
        }
        await reset();
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD, POST" }).end();
        return;
      }
      if (pathname.startsWith(AVATAR_PREFIX)) {
        await serveFile(res, avatarsDir, decodeURIComponent(pathname.slice(AVATAR_PREFIX.length)));
        return;
      }
      await serveFile(res, frontendBuild, pathname === "/" ? "index.html" : decodeURIComponent(pathname));
    } catch (error) {
      console.error(`realworld-angularjs: ${req.method} ${req.url} failed:`, error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("internal error");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FRONTEND_PORT, () => resolve(server));
  });
}

function toSpecErrors(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (parsed === null || typeof parsed.errors !== "object" || parsed.errors === null) return text;
  const errors = Object.fromEntries(
    Object.entries(parsed.errors).map(([field, messages]) => [field, Array.isArray(messages) ? messages : [String(messages)]]),
  );
  return JSON.stringify({ ...parsed, errors });
}

/** Answers CORS preflights itself and forwards everything else to the backend unchanged. */
function startApiProxy() {
  const server = createServer((req, res) => {
    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, PUT, PATCH, POST, DELETE",
        "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "",
        "access-control-max-age": "600",
        "content-length": "0",
      });
      res.end();
      return;
    }
    const upstream = request(
      { host: "127.0.0.1", port: BACKEND_PORT, method: req.method, path: req.url, headers: req.headers },
      (backendRes) => {
        if (backendRes.statusCode !== 422) {
          res.writeHead(backendRes.statusCode ?? 502, backendRes.headers);
          backendRes.pipe(res);
          return;
        }
        const chunks = [];
        backendRes.on("data", (chunk) => chunks.push(chunk));
        backendRes.on("end", () => {
          const body = toSpecErrors(Buffer.concat(chunks).toString("utf8"));
          const headers = { ...backendRes.headers, "content-length": String(Buffer.byteLength(body)) };
          delete headers["transfer-encoding"];
          res.writeHead(422, headers);
          res.end(body);
        });
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(503, { "content-type": "application/json", "access-control-allow-origin": "*" });
      }
      res.end(JSON.stringify({ errors: { backend: ["is restarting, retry shortly"] } }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(API_PORT, () => resolve(server));
  });
}

async function resetCommand() {
  if (await isListening(FRONTEND_ORIGIN)) {
    const res = await fetch(`${FRONTEND_ORIGIN}${RESET_PATH}`, { method: "POST" });
    if (!res.ok) fail(`reset failed: HTTP ${res.status}`);
    console.log("realworld-angularjs: running instance reset to seed");
    return;
  }
  await writeSeed(dataDir, FRONTEND_ORIGIN);
  console.log(`realworld-angularjs: nothing running on ${FRONTEND_ORIGIN}; data files reseeded`);
}

async function main() {
  if (process.argv.includes("--reset")) {
    await resetCommand();
    return;
  }
  for (const url of [FRONTEND_ORIGIN, API_URL, BACKEND_URL]) {
    if (await isListening(url)) fail(`${url} is already in use; stop it first, or run with --reset to reseed it`);
  }
  if (!existsSync(join(frontendBuild, "main.js"))) fail(`missing ${frontendBuild}/main.js; run node tools/build-frontend.mjs`);
  await ensureBackendDependencies();

  const backend = new Backend();
  let queue = Promise.resolve();
  const reset = () => {
    const next = queue.then(async () => {
      await backend.stop();
      await writeSeed(dataDir, FRONTEND_ORIGIN);
      await backend.start();
    });
    queue = next.catch(() => {});
    return next;
  };

  await writeSeed(dataDir, FRONTEND_ORIGIN);
  await backend.start();
  const apiProxy = await startApiProxy();
  const server = await startFrontend(reset);

  const shutdown = async () => {
    server.close();
    apiProxy.close();
    await backend.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Conduit (AngularJS) ready at ${FRONTEND_ORIGIN} (API ${API_URL}, reset: POST ${FRONTEND_ORIGIN}${RESET_PATH})`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
