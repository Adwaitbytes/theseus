import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { MobileError } from "./errors.js";

export interface CommandSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Merged over the parent environment. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface LogLine {
  /** Which tool produced the line, for example `gradle` or `xcodebuild`. */
  readonly source: string;
  readonly stream: "stdout" | "stderr" | "info";
  readonly text: string;
}

export type LogFn = (line: LogLine) => void;

export interface RunOptions {
  readonly timeoutMs: number;
  /** Label used for log lines and error messages. */
  readonly source: string;
  readonly onLog?: LogFn;
  readonly signal?: AbortSignal;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Raw stdout, for binary output such as `adb exec-out screencap -p`. */
  readonly stdoutBytes: Buffer;
}

export type Runner = (spec: CommandSpec, options: RunOptions) => Promise<CommandResult>;

const KILL_GRACE_MS = 5_000;
const TAIL_LINES = 40;

export function formatCommand(spec: CommandSpec): string {
  return [spec.command, ...spec.args].map((part) => (/[\s'"]/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

export function tailLines(text: string, count = TAIL_LINES): string {
  return text.trimEnd().split("\n").slice(-count).join("\n");
}

/**
 * The part of a build log that explains the failure. Gradle prints its cause in a
 * "What went wrong" block followed by boilerplate, so the plain tail misses it.
 */
export function failureExcerpt(text: string, count = TAIL_LINES): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.includes("What went wrong"));
  if (start === -1) return tailLines(text, count);
  const end = lines.findIndex((line, index) => index > start && line.includes("* Try:"));
  return lines.slice(start, end === -1 ? start + count : Math.min(end, start + count)).join("\n");
}

/** Splits a chunked stream into whole lines, holding back a partial final line until the next chunk. */
export class LineSplitter {
  private pending = "";

  constructor(private readonly emit: (line: string) => void) {}

  push(chunk: string): void {
    const parts = (this.pending + chunk).split(/\r?\n/);
    this.pending = parts.pop() ?? "";
    for (const part of parts) this.emit(part);
  }

  flush(): void {
    if (this.pending.length > 0) this.emit(this.pending);
    this.pending = "";
  }
}

/**
 * Spawns a command, streams its output line by line and enforces our own timeout.
 * Resolves with the exit code for any exit; rejects only when the process could not
 * run to completion (missing binary, timeout, abort).
 */
export const runCommand: Runner = (spec, options) =>
  new Promise<CommandResult>((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new MobileError("aborted", `${options.source} was aborted before it started`, "Start the operation again."));
      return;
    }
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const log = (stream: LogLine["stream"]) => (text: string) => options.onLog?.({ source: options.source, stream, text });
    const outLines = new LineSplitter(log("stdout"));
    const errLines = new LineSplitter(log("stderr"));
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    };
    const fail = (error: MobileError) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      reject(error);
    };
    const timer = setTimeout(
      () =>
        fail(
          new MobileError(
            "timeout",
            `${options.source} did not finish within ${Math.round(options.timeoutMs / 1000)}s: ${formatCommand(spec)}`,
            "Raise the timeout for this step, or check the log tail for a hang (a prompt waiting for input, a locked file).",
            { logTail: tailLines(Buffer.concat([...stdoutChunks, ...stderrChunks]).toString("utf8")) },
          ),
        ),
      options.timeoutMs,
    );
    const onAbort = () =>
      fail(new MobileError("aborted", `${options.source} was aborted: ${formatCommand(spec)}`, "Start the operation again."));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      outLines.push(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      errLines.push(chunk.toString("utf8"));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        fail(
          new MobileError(
            "command-not-found",
            `${spec.command} was not found`,
            `Install ${spec.command} or put it on PATH.`,
            { cause: error },
          ),
        );
        return;
      }
      fail(new MobileError("command-failed", `${options.source} could not start: ${error.message}`, "Check the command and its permissions.", { cause: error }));
    });
    child.on("close", (code, signal) => {
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      cleanup();
      outLines.flush();
      errLines.flush();
      const stdoutBytes = Buffer.concat(stdoutChunks);
      resolve({
        exitCode: code ?? (signal === null ? 1 : 128),
        stdout: stdoutBytes.toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdoutBytes,
      });
    });
  });

export type DetachedSpawner = (spec: CommandSpec, logFile: string) => Promise<void>;

/**
 * Starts a long-lived process (the emulator) that outlives this one, with stdout and stderr
 * written to `logFile` (truncated first) so an early crash can be diagnosed. Resolves once it has spawned.
 */
export const spawnDetached: DetachedSpawner = (spec, logFile) =>
  new Promise<void>((resolve, reject) => {
    const fd = openSync(logFile, "w");
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    // The child holds its own copy of the descriptor.
    closeSync(fd);
    child.once("error", (error) =>
      reject(new MobileError("command-failed", `could not start ${formatCommand(spec)}: ${error.message}`, "Check the binary path and permissions.", { cause: error })),
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });

/** Throws a MobileError built by `toError` when the command exits non-zero. */
export async function runChecked(
  run: Runner,
  spec: CommandSpec,
  options: RunOptions,
  toError: (result: CommandResult) => MobileError,
): Promise<CommandResult> {
  const result = await run(spec, options);
  if (result.exitCode !== 0) throw toError(result);
  return result;
}

export function commandFailed(source: string, spec: CommandSpec, result: CommandResult, remedy: string): MobileError {
  return new MobileError(
    "command-failed",
    `${source} exited with code ${result.exitCode}: ${formatCommand(spec)}`,
    remedy,
    { logTail: tailLines(`${result.stdout}\n${result.stderr}`) },
  );
}
