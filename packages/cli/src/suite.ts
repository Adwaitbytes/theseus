import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  TheseusError,
  resolveVerifyTarget,
  suiteTarget,
  type KaneClient,
  type SuiteMember,
  type SuiteResult,
} from "@theseus/core";
import { createKaneClient } from "@theseus/kane";
import { formatElapsed, pad, truncate } from "./tui/theme.js";
import { plural, stdoutColorizer, type Colorize } from "./output.js";
import { loadRun } from "./verify.js";

export interface SuiteOptions {
  readonly target: string;
  readonly parallel: number;
  /** Run against this deployment instead of the URL in the committed files. */
  readonly url?: string;
  /** Run against this build instead of the app path in the committed files. */
  readonly app?: string;
  readonly workDir: string;
  readonly failFast?: boolean;
  readonly headed?: boolean;
  readonly json?: boolean;
}

export interface SuiteDeps {
  readonly kane: KaneClient;
  readonly write: (text: string) => void;
  readonly color: Colorize;
}

export function defaultSuiteDeps(): SuiteDeps {
  return { kane: createKaneClient(), write: (text) => process.stdout.write(text), color: stdoutColorizer() };
}

const STATUS_TONE = { passed: "pass", failed: "fail", broken: "infra", interrupted: "running" } as const;
const STATUS_GLYPH = { passed: "■", failed: "×", broken: "!", interrupted: "-" } as const;

function seconds(durationS: number): string {
  return formatElapsed(durationS * 1000);
}

export function renderMemberLine(member: SuiteMember, color: Colorize): string {
  const glyph = color(STATUS_GLYPH[member.status], STATUS_TONE[member.status]);
  const why = member.failure === undefined ? "" : `  ${member.failure.stepIndex === undefined ? "" : `step ${member.failure.stepIndex}: `}${member.failure.message}`;
  return `  ${glyph} ${pad(member.file, 36)}${pad(member.status, 13)}${seconds(member.durationS)}${color(truncate(why, 72), "muted")}`;
}

/** Kane's exit codes, mapped onto ours: a refused plan is bad input, a cancel is an interrupt. */
export function suiteExitCode(result: SuiteResult): number {
  switch (result.status) {
    case "passed":
      return 0;
    case "error":
      return 2;
    case "cancelled":
      return 130;
    case "failed":
    case "timeout":
      return 1;
  }
}

export function renderSuiteSummary(result: SuiteResult, color: Colorize): string {
  const lines: string[] = [""];
  if (!result.planValid && result.members.length === 0) {
    lines.push(color("Kane refused the plan; nothing ran.", "fail"));
    for (const refused of result.refused) lines.push(`  ${refused.path}  ${color(refused.reason, "fail")}`);
    if (result.stderr !== undefined && result.stderr.length > 0) lines.push(color(truncate(result.stderr, 400), "muted"));
    return `${lines.join("\n")}\n`;
  }
  const total = result.totals?.tests ?? result.members.length;
  const passed = result.totals?.passed ?? result.members.filter((member) => member.status === "passed").length;
  const tone = result.status === "passed" ? "pass" : "fail";
  lines.push(`${color("Suite", undefined, true)}  ${color(`${passed} of ${plural(total, "test")} passed`, tone)}  ${color(seconds(result.durationS), "muted")}`);
  if (result.status === "timeout") lines.push(color("The suite hit the time limit and was stopped.", "fail"));
  if (result.status === "cancelled") lines.push(color("The suite was cancelled; the evidence pack holds what finished.", "running"));
  const failing = result.members.filter((member) => member.status !== "passed");
  for (const member of failing) {
    lines.push(`  ${color(member.file, "fail")}  ${member.failure?.message ?? member.status}`);
    if (member.logPath !== undefined) lines.push(color(`    log ${member.logPath}`, "muted"));
  }
  if (result.status === "error" && result.stderr !== undefined && result.stderr.length > 0) lines.push(color(truncate(result.stderr, 400), "muted"));
  return `${lines.join("\n")}\n`;
}

async function testFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith("_test.md"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

/**
 * `theseus suite`: runs a target's committed `_test.md` suite with `kane-cli testrun`. With
 * `--url` or `--app` the suite is re-rendered into the work directory, so the committed files
 * keep their stable addresses. A run recorded before suites were exported gets them written now.
 */
export async function suite(runDir: string, options: SuiteOptions, deps: SuiteDeps = defaultSuiteDeps(), signal?: AbortSignal): Promise<number> {
  const voyage = await loadRun(runDir);
  const resolved = resolveVerifyTarget(voyage, options.target);
  const { write, color } = deps;
  const quiet = options.json === true;
  const committed = resolved.isOriginal ? join(resolve(runDir), "spec") : join(resolve(runDir), "spec", resolved.target.id);
  const override = { ...(options.url === undefined ? {} : { url: options.url }), ...(options.app === undefined ? {} : { app: options.app }) };
  const overridden = options.url !== undefined || options.app !== undefined;
  if (options.url !== undefined && resolved.target.platform !== "web") throw new TheseusError("config-invalid", `--url applies to web targets; ${resolved.target.id} is ${resolved.target.platform}`);
  if (options.app !== undefined && resolved.target.platform === "web") throw new TheseusError("config-invalid", `--app applies to mobile targets; ${resolved.target.id} is a web target`);

  let dir = committed;
  if (overridden) {
    dir = join(resolve(options.workDir), voyage.id, "suite", resolved.target.id);
    await deps.kane.exportTestMd(voyage.spec.behaviors, resolved.isOriginal ? { ...resolved.target, ...override } : suiteTarget(resolved.target, override), dir);
  } else if ((await testFiles(committed)).length === 0) {
    if (resolved.isOriginal) throw new TheseusError("file-invalid", `no _test.md files in ${committed}; run the baseline phase first`);
    const written = await deps.kane.exportTestMd(voyage.spec.behaviors, suiteTarget(resolved.target), committed);
    if (!quiet) write(color(`Wrote ${plural(written.length, "test")} to ${committed}\n`, "muted"));
  }

  const mobile = resolved.target.platform !== "web";
  // Kane refuses more than one worker for local emulator or simulator members.
  const parallel = mobile ? 1 : options.parallel;
  if (!quiet) {
    if (mobile && options.parallel > 1) write(color("Mobile suites run one test at a time; using --parallel 1.\n", "running"));
    const count = (await testFiles(dir)).length;
    write(`Running the ${color(resolved.target.label, "brand")} suite with Kane (${plural(count, "test")}, ${plural(parallel, "worker")})\n\n`);
  }
  const result = await deps.kane.runSuite({
    dir,
    parallel,
    headless: options.headed !== true,
    name: `theseus ${voyage.id} ${resolved.target.id}`,
    ...(options.failFast === true ? { onFailure: "fail-fast" as const } : {}),
    ...(signal === undefined ? {} : { signal }),
    ...(quiet ? {} : { onMember: (event) => (event.kind === "end" ? write(`${renderMemberLine(event.member, color)}\n`) : undefined) }),
  });
  write(quiet ? `${JSON.stringify(result, null, 2)}\n` : renderSuiteSummary(result, color));
  return suiteExitCode(result);
}
