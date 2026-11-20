import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { KaneStatus } from "@theseus/schema";
import { KaneAbortedError, KaneSpawnError } from "./errors.js";
import { LineSplitter, parseKaneLine, type KaneEvent } from "./ndjson.js";

export interface KaneProcessOptions {
  readonly bin: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env: NodeJS.ProcessEnv;
  /** Our own wall-clock limit; the whole process group is killed when it passes. */
  readonly timeoutMs: number;
  /** Time between SIGTERM and SIGKILL, so Kane can seal its evidence pack. */
  readonly killGraceMs?: number;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: KaneEvent) => void;
}

export interface KaneProcessResult {
  /** `null` when the process was killed by a signal. */
  readonly exitCode: number | null;
  readonly killSignal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly events: readonly KaneEvent[];
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

const DEFAULT_KILL_GRACE_MS = 5_000;

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    // A negative pid targets the process group: kane-cli's launcher re-spawns itself onto a bundled
    // Node and drives Chrome or a device, so killing only the direct child would leave orphans.
    process.kill(-pid, signal);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
    throw error;
  }
}

/** Spawns kane-cli once with stdin closed, streaming parsed stdout events and capturing stderr. */
export function runKaneProcess(options: KaneProcessOptions): Promise<KaneProcessResult> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(new KaneAbortedError("Kane run aborted before it started"));

  return new Promise<KaneProcessResult>((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(options.bin, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      // "ignore" connects stdin to /dev/null: Kane must never wait on an interactive prompt.
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const events: KaneEvent[] = [];
    const splitter = new LineSplitter();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let callbackError: unknown;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = (): void => {
      if (child.pid === undefined || killTimer !== undefined) return;
      killGroup(child.pid, "SIGTERM");
      const pid = child.pid;
      killTimer = setTimeout(() => killGroup(pid, "SIGKILL"), options.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
    };

    const handleLine = (line: string): void => {
      const event = parseKaneLine(line);
      if (event === null) return;
      events.push(event);
      if (options.onEvent === undefined || callbackError !== undefined) return;
      try {
        options.onEvent(event);
      } catch (error) {
        callbackError = error;
        terminate();
      }
    };

    const wallClock = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      terminate();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      for (const line of splitter.push(chunk)) handleLine(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const cleanup = (): void => {
      clearTimeout(wallClock);
      if (killTimer !== undefined) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    child.on("error", (error) => {
      cleanup();
      reject(new KaneSpawnError(`Could not start ${options.bin}: ${error.message}`, { cause: error }));
    });

    child.on("close", (exitCode, killSignal) => {
      cleanup();
      for (const line of splitter.flush()) handleLine(line);
      if (aborted) {
        reject(new KaneAbortedError("Kane run aborted by the caller"));
        return;
      }
      if (callbackError !== undefined) {
        reject(callbackError);
        return;
      }
      resolve({ exitCode, killSignal, timedOut, events, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

/** Exit codes from the kane-cli contract: 0 passed, 1 failed, 2 infrastructure, 3 timeout or cancelled. */
export function statusFromExit(exitCode: number | null, timedOut: boolean): KaneStatus {
  if (timedOut) return "timeout";
  switch (exitCode) {
    case 0:
      return "passed";
    case 1:
      return "failed";
    case 3:
      return "timeout";
    default:
      return "error";
  }
}

/** Exit-2 causes that retrying cannot fix: no sign-in, or the device hub refusing the plan. */
const PERMANENT_INFRA_FAILURE = /not authenticated|could not resolve credentials|failed to open the mobile hub session/i;

/** Kane's own browser dying mid-run says nothing about the app under test (seen live as TargetClosedError). */
const BROWSER_CRASH = /TargetClosedError|Target page, context or browser has been closed|browser has disconnected/i;

export function browserCrashed(result: KaneProcessResult): boolean {
  return result.exitCode !== 0 && !result.timedOut && (BROWSER_CRASH.test(result.stdout) || BROWSER_CRASH.test(result.stderr));
}

export function isRetryableInfraFailure(result: KaneProcessResult): boolean {
  if (result.timedOut) return false;
  if (browserCrashed(result)) return true;
  return result.exitCode === 2 && !PERMANENT_INFRA_FAILURE.test(result.stderr);
}

export interface RetryPolicy {
  readonly attempts: number;
  readonly baseDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseDelayMs: 2_000 };

/**
 * Runs kane-cli, retrying infrastructure failures (exit 2) with exponential backoff.
 * Exit 2 is never a verdict on the app under test, so it must not reach the caller as a failure
 * while a retry might still succeed. Returns every attempt, last one last.
 */
export async function runKaneWithRetry(
  options: KaneProcessOptions,
  policy: RetryPolicy = DEFAULT_RETRY,
): Promise<readonly KaneProcessResult[]> {
  const attempts: KaneProcessResult[] = [];
  for (let attempt = 1; ; attempt++) {
    const result = await runKaneProcess(options);
    attempts.push(result);
    if (attempt >= policy.attempts || !isRetryableInfraFailure(result)) return attempts;
    try {
      await sleep(policy.baseDelayMs * 2 ** (attempt - 1), undefined, { signal: options.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new KaneAbortedError("Kane run aborted while waiting to retry", { cause: error });
      }
      throw error;
    }
  }
}
