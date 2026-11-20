import { spawn } from "node:child_process";
import { TheseusError, errorMessage } from "../errors.js";
import { freePort, waitForHttp } from "../util/net.js";
import { runProcess } from "../util/process.js";
import { serveStatic } from "../util/static-server.js";

export interface RunningApp {
  readonly url: string;
  stop(): Promise<void>;
}

export interface LaunchOptions {
  readonly signal?: AbortSignal;
  readonly onLog?: (line: string) => void;
}

export interface AppLauncher {
  /** `npm install && npm run build && npm run start` with $PORT, the contract every regrown web app follows. */
  launchNpmApp(dir: string, options?: LaunchOptions): Promise<RunningApp>;
  /** Runs an arbitrary shell command that serves on $PORT. */
  launchCommand(dir: string, command: string, options?: LaunchOptions): Promise<RunningApp>;
  serveStatic(dir: string): Promise<RunningApp>;
}

const INSTALL_TIMEOUT_MS = 10 * 60_000;
const BUILD_TIMEOUT_MS = 10 * 60_000;
const START_TIMEOUT_MS = 120_000;
const LOG_TAIL_LINES = 40;

function tail(text: string): string {
  return text.trim().split("\n").slice(-LOG_TAIL_LINES).join("\n");
}

async function step(dir: string, args: readonly string[], timeoutMs: number, options: LaunchOptions): Promise<void> {
  options.onLog?.(`$ npm ${args.join(" ")}`);
  const result = await runProcess("npm", args, {
    cwd: dir,
    timeoutMs,
    env: { ...process.env, CI: "1" },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (result.exitCode !== 0) {
    throw new TheseusError(
      "app-start-failed",
      `npm ${args.join(" ")} ${result.timedOut ? "timed out" : `exited with ${result.exitCode}`}\n${tail(`${result.stdout}\n${result.stderr}`)}`,
    );
  }
}

function startServer(dir: string, command: string, args: readonly string[], port: number, options: LaunchOptions): Promise<RunningApp> {
  const child = spawn(command, [...args], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  let exited = false;
  const collect = (chunk: Buffer): void => {
    output = (output + chunk.toString("utf8")).slice(-64 * 1024);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const exitedPromise = new Promise<void>((resolveExit) => {
    child.on("exit", () => {
      exited = true;
      resolveExit();
    });
  });
  child.on("error", (error) => {
    exited = true;
    output += `\n${error.message}`;
  });
  const stop = async (): Promise<void> => {
    if (exited || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // The process group is already gone, which is what stop wants.
      return;
    }
    const timer = setTimeout(() => {
      if (!exited && child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    }, 5000);
    await exitedPromise;
    clearTimeout(timer);
  };
  const url = `http://127.0.0.1:${port}/`;
  options.onLog?.(`starting on ${url}`);
  return waitForHttp(url, {
    timeoutMs: START_TIMEOUT_MS,
    isAlive: () => !exited,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }).then(
    () => ({ url, stop }),
    async (error: unknown) => {
      await stop();
      throw new TheseusError("app-start-failed", `the app did not start: ${errorMessage(error)}\n${tail(output)}`, { cause: error });
    },
  );
}

export const defaultLauncher: AppLauncher = {
  async launchNpmApp(dir, options = {}) {
    await step(dir, ["install", "--no-audit", "--no-fund"], INSTALL_TIMEOUT_MS, options);
    await step(dir, ["run", "build"], BUILD_TIMEOUT_MS, options);
    return startServer(dir, "npm", ["run", "start"], await freePort(), options);
  },
  async launchCommand(dir, command, options = {}) {
    return startServer(dir, "/bin/sh", ["-c", command], await freePort(), options);
  },
  async serveStatic(dir) {
    const server = await serveStatic(dir, await freePort());
    return { url: server.url, stop: () => server.close() };
  },
};
