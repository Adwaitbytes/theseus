import { spawn } from "node:child_process";
import { TheseusError } from "../errors.js";

export interface RunProcessOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly stdin?: string;
  readonly onStdoutLine?: (line: string) => void;
  readonly onStderrLine?: (line: string) => void;
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** Keeps the tail of a stream so a chatty build cannot exhaust memory. */
const MAX_CAPTURE = 256 * 1024;

function lineSplitter(onLine: ((line: string) => void) | undefined): (chunk: string) => void {
  let buffer = "";
  return (chunk) => {
    if (onLine === undefined) return;
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      onLine(buffer.slice(0, newline).replace(/\r$/, ""));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  };
}

/**
 * Runs a command to completion. It never throws for a non-zero exit (callers decide
 * what failure means); it throws only when the binary cannot be started or on abort.
 * The child gets its own process group so a timeout or abort kills its whole tree.
 */
export function runProcess(command: string, args: readonly string[], options: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    if (options.signal?.aborted === true) {
      reject(new TheseusError("aborted", `${command} aborted before start`));
      return;
    }
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    const outLines = lineSplitter(options.onStdoutLine);
    const errLines = lineSplitter(options.onStderrLine);
    const killTree = (): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // The group already exited between the check and the kill; nothing left to stop.
      }
    };
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            killTree();
          }, options.timeoutMs);
    const onAbort = (): void => {
      aborted = true;
      killTree();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-MAX_CAPTURE);
      outLines(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_CAPTURE);
      errLines(chunk);
    });
    child.on("error", (error) => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(new TheseusError("process-failed", `cannot start ${command}: ${error.message}`, { cause: error }));
    });
    child.on("close", (code, signal) => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (aborted) {
        reject(new TheseusError("aborted", `${command} aborted`));
        return;
      }
      resolvePromise({ exitCode: code ?? (signal === null ? 1 : 128), stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => {
      // A child that exits without reading stdin closes the pipe early; its exit code tells the real story.
    });
    child.stdin.end(options.stdin ?? "");
  });
}

/** Runs a command and throws a typed error if it exits non-zero. */
export async function runChecked(command: string, args: readonly string[], options: RunProcessOptions): Promise<ProcessResult> {
  const result = await runProcess(command, args, options);
  if (result.exitCode !== 0) {
    const detail = (result.stderr.trim() || result.stdout.trim()).split("\n").slice(-12).join("\n");
    throw new TheseusError(
      result.timedOut ? "timeout" : "process-failed",
      `${command} ${args.join(" ")} exited with ${result.exitCode}${result.timedOut ? " (timed out)" : ""}\n${detail}`,
    );
  }
  return result;
}
