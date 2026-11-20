import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogLine } from "../exec.js";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kills: string[] = [];
  kill(signal: string): boolean {
    this.kills.push(signal);
    return true;
  }
  unref(): void {}
}

const children: FakeChild[] = [];
const spawnMock = vi.fn((_command: string, _args: readonly string[], _options: object) => {
  const child = new FakeChild();
  children.push(child);
  return child;
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { runCommand, LineSplitter, formatCommand, spawnDetached } = await import("../exec.js");

const lastChild = (): FakeChild => {
  const child = children.at(-1);
  if (child === undefined) throw new Error("spawn was not called");
  return child;
};

beforeEach(() => {
  children.length = 0;
  spawnMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LineSplitter", () => {
  it("joins lines split across chunks and flushes the remainder", () => {
    const lines: string[] = [];
    const splitter = new LineSplitter((l) => lines.push(l));
    splitter.push("BUILD SUCC");
    splitter.push("ESSFUL\r\n> Task :app");
    expect(lines).toEqual(["BUILD SUCCESSFUL"]);
    splitter.flush();
    expect(lines).toEqual(["BUILD SUCCESSFUL", "> Task :app"]);
  });
});

describe("formatCommand", () => {
  it("quotes arguments with spaces", () => {
    expect(formatCommand({ command: "xcodebuild", args: ["-destination", "generic/platform=iOS Simulator"] })).toBe(
      'xcodebuild -destination "generic/platform=iOS Simulator"',
    );
  });
});

describe("runCommand", () => {
  it("passes args, cwd and merged env to spawn and streams tagged lines", async () => {
    const logs: LogLine[] = [];
    const pending = runCommand(
      { command: "./gradlew", args: ["assembleRelease"], cwd: "/p/android", env: { JAVA_HOME: "/jdk" } },
      { source: "gradle", timeoutMs: 10_000, onLog: (l) => logs.push(l) },
    );
    const child = lastChild();
    child.stdout.write("line one\nline ");
    child.stderr.write("warning\n");
    child.stdout.write("two");
    await new Promise((r) => setImmediate(r));
    child.emit("close", 0, null);
    const result = await pending;

    const [command, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(command).toBe("./gradlew");
    expect(args).toEqual(["assembleRelease"]);
    expect(options).toMatchObject({ cwd: "/p/android", env: expect.objectContaining({ JAVA_HOME: "/jdk" }) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("line one\nline two");
    expect(logs).toEqual([
      { source: "gradle", stream: "stdout", text: "line one" },
      { source: "gradle", stream: "stderr", text: "warning" },
      { source: "gradle", stream: "stdout", text: "line two" },
    ]);
  });

  it("resolves with a non-zero exit code instead of throwing", async () => {
    const pending = runCommand({ command: "adb", args: ["devices"] }, { source: "adb", timeoutMs: 1_000 });
    lastChild().emit("close", 3, null);
    await expect(pending).resolves.toMatchObject({ exitCode: 3 });
  });

  it("maps ENOENT to a command-not-found MobileError", async () => {
    const pending = runCommand({ command: "pod", args: ["install"] }, { source: "pod", timeoutMs: 1_000 });
    lastChild().emit("error", Object.assign(new Error("spawn pod ENOENT"), { code: "ENOENT" }));
    await expect(pending).rejects.toMatchObject({ name: "MobileError", code: "command-not-found" });
  });

  it("kills the process and rejects with a timeout error carrying the log tail", async () => {
    vi.useFakeTimers();
    const pending = runCommand({ command: "xcodebuild", args: ["build"] }, { source: "xcodebuild", timeoutMs: 1_000 });
    const child = lastChild();
    child.stdout.write("CompileC foo.m\n");
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout", logTail: "CompileC foo.m" });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(child.kills).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.kills).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("kills the process when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = runCommand({ command: "npm", args: ["ci"] }, { source: "npm", timeoutMs: 10_000, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(lastChild().kills).toContain("SIGTERM");
  });

  it("refuses to start when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runCommand({ command: "npm", args: [] }, { source: "npm", timeoutMs: 1_000, signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("spawnDetached", () => {
  const logFile = join(tmpdir(), `theseus-exec-test-${process.pid}.log`);

  it("spawns detached with output going to the log file and resolves on spawn", async () => {
    const pending = spawnDetached({ command: "/sdk/emulator/emulator", args: ["-avd", "pixel"] }, logFile);
    lastChild().emit("spawn");
    await pending;
    expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({ detached: true, stdio: ["ignore", expect.any(Number), expect.any(Number)] });
  });

  it("rejects when the binary cannot start", async () => {
    const pending = spawnDetached({ command: "/missing", args: [] }, logFile);
    lastChild().emit("error", new Error("spawn /missing ENOENT"));
    await expect(pending).rejects.toMatchObject({ code: "command-failed" });
  });
});
