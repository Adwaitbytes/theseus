import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_KANE, fixture, scenarioEnv, tempDir } from "./__fixtures__/helpers.js";
import { KaneAbortedError, KaneSpawnError } from "./errors.js";
import { parseKaneStream } from "./ndjson.js";
import { runKaneProcess, runKaneWithRetry, statusFromExit } from "./process.js";

const fastRetry = { attempts: 3, baseDelayMs: 10 };

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("statusFromExit", () => {
  it("maps the kane-cli exit codes", () => {
    expect(statusFromExit(0, false)).toBe("passed");
    expect(statusFromExit(1, false)).toBe("failed");
    expect(statusFromExit(2, false)).toBe("error");
    expect(statusFromExit(3, false)).toBe("timeout");
    expect(statusFromExit(130, false)).toBe("error");
    expect(statusFromExit(null, false)).toBe("error");
    expect(statusFromExit(null, true)).toBe("timeout");
  });
});

describe("runKaneProcess", () => {
  it("streams events from tiny chunks, captures stderr and closes stdin", async () => {
    const dir = tempDir();
    const argsFile = path.join(dir, "args.json");
    const stdoutFile = fixture("real/pass.ndjson");
    const seen: string[] = [];
    const result = await runKaneProcess({
      bin: FAKE_KANE,
      args: ["run", "objective"],
      env: scenarioEnv(dir, { stdoutFile, chunkSize: 97, stderr: "some stderr\n", exitCode: 0, argsFile }),
      timeoutMs: 20_000,
      onEvent: (event) => seen.push(event.kind),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("some stderr\n");
    expect(result.events).toEqual(parseKaneStream(readFileSync(stdoutFile, "utf8")));
    expect(seen).toEqual(result.events.map((e) => e.kind));
    expect(JSON.parse(readFileSync(argsFile, "utf8")).stdinIsTTY).toBe(false);
  });

  it("kills the whole process group when our wall clock runs out", async () => {
    const dir = tempDir();
    const pidFile = path.join(dir, "grandchild.pid");
    const result = await runKaneProcess({
      bin: FAKE_KANE,
      args: [],
      env: scenarioEnv(dir, { hang: true, grandchildPidFile: pidFile }),
      timeoutMs: 1_000,
      killGraceMs: 500,
    });
    expect(result.timedOut).toBe(true);
    expect(statusFromExit(result.exitCode, result.timedOut)).toBe("timeout");
    expect(result.events.map((e) => e.kind)).toEqual(["progress"]);
    const grandchild = Number(readFileSync(pidFile, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isAlive(grandchild)).toBe(false);
  });

  it("rejects with KaneAbortedError when the caller aborts", async () => {
    const dir = tempDir();
    const controller = new AbortController();
    const run = runKaneProcess({
      bin: FAKE_KANE,
      args: [],
      env: scenarioEnv(dir, { hang: true }),
      timeoutMs: 20_000,
      killGraceMs: 500,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 300);
    await expect(run).rejects.toBeInstanceOf(KaneAbortedError);
  });

  it("rejects with KaneSpawnError when the binary does not exist", async () => {
    await expect(
      runKaneProcess({ bin: "/nonexistent/kane-cli", args: [], env: process.env, timeoutMs: 1_000 }),
    ).rejects.toBeInstanceOf(KaneSpawnError);
  });

  it("surfaces an error thrown by the event callback", async () => {
    const dir = tempDir();
    const run = runKaneProcess({
      bin: FAKE_KANE,
      args: [],
      env: scenarioEnv(dir, { stdoutFile: fixture("synthetic/pass.ndjson") }),
      timeoutMs: 20_000,
      onEvent: () => {
        throw new Error("listener broke");
      },
    });
    await expect(run).rejects.toThrow("listener broke");
  });
});

describe("runKaneWithRetry", () => {
  it("retries exit 2 and returns the first non-infrastructure attempt", async () => {
    const dir = tempDir();
    const counterFile = path.join(dir, "count");
    const attempts = await runKaneWithRetry(
      {
        bin: FAKE_KANE,
        args: [],
        env: scenarioEnv(dir, { counterFile, infraFailures: 2, stdoutFile: fixture("synthetic/pass.ndjson") }),
        timeoutMs: 20_000,
      },
      fastRetry,
    );
    expect(attempts.map((a) => a.exitCode)).toEqual([2, 2, 0]);
  });

  it("gives up after the configured attempts", async () => {
    const dir = tempDir();
    const counterFile = path.join(dir, "count");
    const attempts = await runKaneWithRetry(
      { bin: FAKE_KANE, args: [], env: scenarioEnv(dir, { counterFile, infraFailures: 9 }), timeoutMs: 20_000 },
      fastRetry,
    );
    expect(attempts.map((a) => a.exitCode)).toEqual([2, 2, 2]);
  });

  it("does not retry a missing sign-in or a product failure", async () => {
    const dir = tempDir();
    const notLoggedIn = await runKaneWithRetry(
      {
        bin: FAKE_KANE,
        args: [],
        env: scenarioEnv(dir, { exitCode: 2, stderr: 'Not authenticated [prod]. Run "kane-cli login" first.\n' }),
        timeoutMs: 20_000,
      },
      fastRetry,
    );
    expect(notLoggedIn).toHaveLength(1);
    const failed = await runKaneWithRetry(
      {
        bin: FAKE_KANE,
        args: [],
        env: scenarioEnv(dir, { exitCode: 1, stdoutFile: fixture("synthetic/fail.ndjson") }),
        timeoutMs: 20_000,
      },
      fastRetry,
    );
    expect(failed).toHaveLength(1);
  });
});
