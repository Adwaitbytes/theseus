import { createServer } from "node:net";
import { TheseusError, throwIfAborted } from "../errors.js";

export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a free port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

/** Polls until the URL answers with any HTTP status below 500, which is all "the app is up" needs to mean. */
export async function waitForHttp(
  url: string,
  options: { timeoutMs: number; intervalMs?: number; signal?: AbortSignal; isAlive?: () => boolean },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  const interval = options.intervalMs ?? 500;
  let lastError = "no response";
  while (Date.now() < deadline) {
    throwIfAborted(options.signal);
    if (options.isAlive !== undefined && !options.isAlive()) {
      throw new TheseusError("app-start-failed", `the app process exited before ${url} answered`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1000, interval * 4)) });
      await response.body?.cancel();
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, interval));
  }
  throw new TheseusError("timeout", `${url} did not answer within ${Math.round(options.timeoutMs / 1000)}s (${lastError})`);
}
