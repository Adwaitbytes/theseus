import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TheseusError } from "@theseus/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demo, exitCodeFor, resolveRecording } from "./commands.js";
import { buildProgram } from "./program.js";
import { jsonSink } from "./sink.js";

const line = (phase: string, at: string): string => `${JSON.stringify({ type: "phase", at, phase })}\n`;

async function recording(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "theseus-cli-"));
  for (const [id, time] of [
    ["old", 1_000],
    ["new", 2_000],
  ] as const) {
    await mkdir(join(cwd, "runs", id), { recursive: true });
    const file = join(cwd, "runs", id, "events.ndjson");
    await writeFile(file, line("regrow", "2026-11-21T10:00:00.000Z") + line("done", "2026-11-21T10:00:00.100Z"), "utf8");
    await utimes(file, time, time);
  }
  return cwd;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveRecording", () => {
  it("picks the newest run under ./runs, or the given directory or file", async () => {
    const cwd = await recording();
    expect((await resolveRecording(undefined, cwd)).dir).toBe(join(cwd, "runs", "new"));
    expect((await resolveRecording("runs/old", cwd)).dir).toBe(join(cwd, "runs", "old"));
    expect((await resolveRecording("runs/old/events.ndjson", cwd)).events).toBe(join(cwd, "runs", "old", "events.ndjson"));
    await expect(resolveRecording("runs/missing", cwd)).rejects.toThrow(/no events.ndjson/);
    await expect(resolveRecording(undefined, await mkdtemp(join(tmpdir(), "empty-")))).rejects.toThrow(/does not exist/);
  });
});

describe("demo --json", () => {
  it("replays the recording as NDJSON on stdout", async () => {
    const cwd = await recording();
    const written: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    const code = await demo(join(cwd, "runs", "new"), { json: true, speed: 100 });
    expect(code).toBe(0);
    expect(written.map((text) => JSON.parse(text) as { phase: string }).map((event) => event.phase)).toEqual(["regrow", "done"]);
  });
});

describe("jsonSink", () => {
  it("writes one event per line", async () => {
    const lines: string[] = [];
    const sink = jsonSink((text) => lines.push(text));
    sink.push({ type: "log", at: "2026-11-21T10:00:00.000Z", level: "info", message: "hi" });
    await sink.finish({});
    expect(lines).toEqual(['{"type":"log","at":"2026-11-21T10:00:00.000Z","level":"info","message":"hi"}\n']);
  });
});

describe("exitCodeFor", () => {
  it("maps errors to stable exit codes", () => {
    expect(exitCodeFor(new TheseusError("config-invalid", "x"))).toBe(2);
    expect(exitCodeFor(new TheseusError("budget-exceeded", "x"))).toBe(3);
    expect(exitCodeFor(new TheseusError("aborted", "x"))).toBe(130);
    expect(exitCodeFor(new Error("x"))).toBe(1);
  });
});

describe("program", () => {
  it("rejects an unknown phase and a non-positive speed before running anything", async () => {
    const program = buildProgram(() => {});
    program.exitOverride();
    program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    for (const command of program.commands) {
      command.exitOverride();
      command.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    }
    await expect(program.parseAsync(["node", "theseus", "voyage", "c.json", "--force-phase", "nope"])).rejects.toThrow(/expected one of/);
    await expect(program.parseAsync(["node", "theseus", "demo", "--speed", "0"])).rejects.toThrow(/positive number/);
    await expect(program.parseAsync(["node", "theseus", "regrow", "c.json"])).rejects.toThrow(/--target/);
    await expect(program.parseAsync(["node", "theseus", "regrow", "http://localhost:4170"])).rejects.toThrow(/--to <stacks> is required/);
    await expect(program.parseAsync(["node", "theseus", "regrow", "http://localhost:4170", "--to", "rails"])).rejects.toThrow(/unknown stack rails/);
    await expect(program.parseAsync(["node", "theseus", "init", "http://a.test", "--to", "nextjs", "--race", "codex,gpt"])).rejects.toThrow(/expected one of claude-code, codex/);
    await expect(program.parseAsync(["node", "theseus", "suite", "runs/x", "--target", "nextjs", "--parallel", "0"])).rejects.toThrow(/whole number/);
  });

  it("gives every command a summary and examples, with no dashes or emojis in the copy", () => {
    const program = buildProgram(() => {});
    const names = program.commands.map((command) => command.name());
    expect(names).toEqual(["regrow", "init", "voyage", "capture", "baseline", "strength", "parity", "verify", "suite", "doctor", "serve", "demo"]);
    for (const command of program.commands) {
      let help = "";
      command.configureOutput({ writeOut: (text) => (help += text) });
      command.outputHelp();
      expect(command.summary().length).toBeGreaterThan(10);
      expect(help).toContain("Examples:");
      expect(help).not.toMatch(/[\u2013\u2014]|\p{Extended_Pictographic}/u);
    }
  });
});
