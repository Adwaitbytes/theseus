import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { type DetachedSpawner, type LogFn, type RunOptions, type Runner, runCommand, spawnDetached } from "./exec.js";

/** Everything that touches the machine, injectable so tests never spawn a real process. */
export interface System {
  readonly run: Runner;
  readonly spawnDetached: DetachedSpawner;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly exists: (path: string) => boolean;
  readonly listDir: (path: string) => readonly string[];
  /** File contents, or undefined when the file does not exist. */
  readonly readText: (path: string) => string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homeDir: string;
}

export const nodeSystem: System = {
  run: runCommand,
  spawnDetached,
  sleep: (ms) => delay(ms),
  now: () => Date.now(),
  exists: existsSync,
  listDir: (path) => (existsSync(path) ? readdirSync(path) : []),
  readText: (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined),
  env: process.env,
  homeDir: homedir(),
};

/** Options every public operation accepts. */
export interface OperationOptions {
  /** Receives every line of tool output plus our own progress lines (`stream: "info"`). */
  readonly onLog?: LogFn;
  readonly signal?: AbortSignal;
  /** Overrides for the machine boundary; tests pass fakes here. */
  readonly system?: Partial<System>;
}

export interface Context {
  readonly sys: System;
  readonly onLog: LogFn;
  readonly signal: AbortSignal | undefined;
}

export function createContext(options: OperationOptions): Context {
  return {
    sys: { ...nodeSystem, ...options.system },
    onLog: options.onLog ?? (() => undefined),
    signal: options.signal,
  };
}

export function info(ctx: Context, source: string, text: string): void {
  ctx.onLog({ source, stream: "info", text });
}

/**
 * The `RunOptions` for one step, carrying the operation's log callback and abort signal.
 * `quiet` keeps binary stdout (screenshots) out of the log stream.
 */
export function step(ctx: Context, source: string, timeoutMs: number, quiet = false): RunOptions {
  return {
    source,
    timeoutMs,
    ...(quiet ? {} : { onLog: ctx.onLog }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  };
}
