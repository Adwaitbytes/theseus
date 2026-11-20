import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKaneStream } from "../ndjson.js";
import type { KaneProcessResult } from "../process.js";

export const FIXTURES = path.dirname(fileURLToPath(import.meta.url));
export const FAKE_KANE = path.join(FIXTURES, "fake-kane.mjs");
chmodSync(FAKE_KANE, 0o755);

export function fixture(relative: string): string {
  return path.join(FIXTURES, relative);
}

export function readFixture(relative: string): string {
  return readFileSync(fixture(relative), "utf8");
}

export function tempDir(prefix = "theseus-kane-"): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export interface FakeScenario {
  readonly stdoutFile?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly chunkSize?: number;
  readonly hang?: boolean;
  readonly grandchildPidFile?: string;
  readonly argsFile?: string;
  readonly counterFile?: string;
  readonly infraFailures?: number;
}

/** Writes a scenario for fake-kane.mjs and returns the environment that selects it. */
export function scenarioEnv(dir: string, scenario: FakeScenario): NodeJS.ProcessEnv {
  const file = path.join(dir, `scenario-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(scenario));
  return { ...process.env, FAKE_KANE_SCENARIO: file };
}

/** A completed process result built from a recorded stream, for pure normalization tests. */
export function resultFromFixture(
  relative: string,
  overrides: Partial<Omit<KaneProcessResult, "events" | "stdout">> = {},
): KaneProcessResult {
  const stdout = readFixture(relative);
  return {
    exitCode: 0,
    killSignal: null,
    timedOut: false,
    stderr: "",
    durationMs: 1000,
    ...overrides,
    events: parseKaneStream(stdout),
    stdout,
  };
}
