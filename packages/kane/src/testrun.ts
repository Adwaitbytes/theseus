import path from "node:path";
import { z } from "zod";
import type { SuiteMember, SuiteMemberStatus, SuiteResult, SuiteStatus, SuiteTotals } from "./contract.js";
import type { DeviceSelection } from "./command.js";
import { LineSplitter } from "./ndjson.js";
import type { KaneProcessResult } from "./process.js";

/**
 * Parser for the `kane-cli testrun run --agent` NDJSON stream (kane-cli skill, references/testrun.md).
 * Same rules as the `run` parser: unknown event types and fields are ignored, and a field whose type
 * drifts degrades to `undefined` instead of rejecting the event.
 */

function lenient<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

/** Plan failures are reason codes such as `org_mismatch`; an object form is reduced to its message. */
const PlanFailure = z
  .union([z.string(), z.looseObject({ message: z.string().optional(), reason: z.string().optional(), code: z.string().optional() })])
  .transform((value) => (typeof value === "string" ? value : (value.message ?? value.reason ?? value.code ?? "refused")));

export const TestrunPlan = z.object({
  type: z.literal("testrun_plan"),
  members: z
    .array(z.object({ path: z.string(), test_id: lenient(z.string()), failure: lenient(PlanFailure) }))
    .catch([]),
  valid: z.boolean().catch(false),
  parallel: lenient(z.number().int()),
});
export type TestrunPlan = z.infer<typeof TestrunPlan>;

export const TestrunMemberStart = z.object({
  type: z.enum(["testrun_member_start", "testrun_authored_member_start"]),
  path: z.string(),
  test_id: lenient(z.string()),
  session_id: lenient(z.string()),
  log_path: lenient(z.string()),
});
export type TestrunMemberStart = z.infer<typeof TestrunMemberStart>;

export const TestrunMemberEnd = z.object({
  type: z.enum(["testrun_member_end", "testrun_authored_member_end"]),
  path: z.string(),
  test_id: lenient(z.string()),
  status: z.string().catch("unknown"),
  duration_s: lenient(z.number().nonnegative()),
  log_path: lenient(z.string()),
  failure: lenient(z.object({ message: z.string().catch(""), step_index: lenient(z.number().int()) })),
});
export type TestrunMemberEnd = z.infer<typeof TestrunMemberEnd>;

const count = z.number().int().nonnegative().catch(0);

export const TestrunSummary = z.object({
  type: z.literal("testrun_summary"),
  totals: z
    .object({ tests: count, passed: count, failed: count, broken: count, skipped: count, authored: count })
    .catch({ tests: 0, passed: 0, failed: 0, broken: 0, skipped: 0, authored: 0 }),
  duration_s: lenient(z.number().nonnegative()),
  cancelled: lenient(z.boolean()),
  execution: lenient(z.object({ id: lenient(z.string()), status: lenient(z.string()) })),
});
export type TestrunSummary = z.infer<typeof TestrunSummary>;

export const TestrunDone = z.object({
  type: z.literal("testrun_done"),
  execution_id: lenient(z.string()),
  overall_status: z.string().catch("unknown"),
});
export type TestrunDone = z.infer<typeof TestrunDone>;

export type TestrunEvent =
  | { readonly kind: "plan"; readonly event: TestrunPlan }
  | { readonly kind: "member_start"; readonly event: TestrunMemberStart }
  | { readonly kind: "member_end"; readonly event: TestrunMemberEnd }
  | { readonly kind: "summary"; readonly event: TestrunSummary }
  | { readonly kind: "done"; readonly event: TestrunDone };

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // Kane may interleave plain text; the contract says to skip non-JSON lines.
    return undefined;
  }
}

/** Classifies one stdout line of a suite run. Returns `null` for anything that is not a known testrun event. */
export function parseTestrunLine(line: string): TestrunEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  const value = parseJson(trimmed);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const type: unknown = (value as Record<string, unknown>).type;
  switch (type) {
    case "testrun_plan": {
      const parsed = TestrunPlan.safeParse(value);
      return parsed.success ? { kind: "plan", event: parsed.data } : null;
    }
    case "testrun_member_start":
    case "testrun_authored_member_start": {
      const parsed = TestrunMemberStart.safeParse(value);
      return parsed.success ? { kind: "member_start", event: parsed.data } : null;
    }
    case "testrun_member_end":
    case "testrun_authored_member_end": {
      const parsed = TestrunMemberEnd.safeParse(value);
      return parsed.success ? { kind: "member_end", event: parsed.data } : null;
    }
    case "testrun_summary": {
      const parsed = TestrunSummary.safeParse(value);
      return parsed.success ? { kind: "summary", event: parsed.data } : null;
    }
    case "testrun_done": {
      const parsed = TestrunDone.safeParse(value);
      return parsed.success ? { kind: "done", event: parsed.data } : null;
    }
    default:
      return null;
  }
}

export function parseTestrunStream(text: string): TestrunEvent[] {
  const splitter = new LineSplitter();
  const lines = [...splitter.push(text), ...splitter.flush()];
  return lines.map(parseTestrunLine).filter((event): event is TestrunEvent => event !== null);
}

export interface TestrunArgsOptions {
  readonly parallel?: number | undefined;
  readonly headless?: boolean | undefined;
  readonly name?: string | undefined;
  readonly onFailure?: "continue" | "fail-fast" | undefined;
  readonly device?: DeviceSelection | undefined;
}

/** Arguments for `kane-cli testrun run` (references/testrun.md). Explicit paths must end in `_test.md`. */
export function buildTestrunArgs(files: readonly string[], options: TestrunArgsOptions = {}): string[] {
  const args = ["testrun", "run", ...files, "--agent", "--parallel", String(options.parallel ?? 1)];
  if (options.headless ?? true) args.push("--headless");
  if (options.onFailure !== undefined) args.push("--on-failure", options.onFailure);
  if (options.name !== undefined) args.push("--name", options.name);
  if (options.device !== undefined) args.push("--device-name", options.device.name, "--os-version", options.device.osVersion);
  return args;
}

const MEMBER_STATUSES: readonly SuiteMemberStatus[] = ["passed", "failed", "broken", "interrupted"];

export function memberOf(event: TestrunMemberEnd): SuiteMember {
  const status = (MEMBER_STATUSES as readonly string[]).includes(event.status) ? (event.status as SuiteMemberStatus) : "broken";
  return {
    path: event.path,
    file: path.basename(event.path),
    status,
    durationS: event.duration_s ?? 0,
    authored: event.type === "testrun_authored_member_end",
    ...(event.test_id === undefined ? {} : { testId: event.test_id }),
    ...(event.log_path === undefined ? {} : { logPath: event.log_path }),
    ...(event.failure === undefined
      ? {}
      : { failure: { message: event.failure.message, ...(event.failure.step_index === undefined ? {} : { stepIndex: event.failure.step_index }) } }),
  };
}

/** Exit codes from references/testrun.md: 0 all passed, 1 a member failed, 2 usage or invalid plan, 3 cancelled. */
export function suiteStatusFromExit(exitCode: number | null, timedOut: boolean): SuiteStatus {
  if (timedOut) return "timeout";
  switch (exitCode) {
    case 0:
      return "passed";
    case 1:
      return "failed";
    case 3:
      return "cancelled";
    default:
      return "error";
  }
}

/**
 * Folds a finished suite process into one result. Members are keyed by file name, because the
 * authored pass reports relative paths where the replay pass reports absolute ones; the last
 * end event for a file wins, since authoring runs after the replays.
 */
export function summarizeSuite(result: KaneProcessResult): SuiteResult {
  const events = parseTestrunStream(result.stdout);
  const plan = events.flatMap((event) => (event.kind === "plan" ? [event.event] : [])).at(-1);
  const summary = events.flatMap((event) => (event.kind === "summary" ? [event.event] : [])).at(-1);
  const done = events.flatMap((event) => (event.kind === "done" ? [event.event] : [])).at(-1);
  const members = new Map<string, SuiteMember>();
  for (const event of events) {
    if (event.kind !== "member_end") continue;
    const member = memberOf(event.event);
    members.set(member.file, member);
  }
  const totals: SuiteTotals | undefined = summary?.totals;
  const status = suiteStatusFromExit(result.exitCode, result.timedOut);
  const refused = (plan?.members ?? []).flatMap((member) =>
    member.failure === undefined ? [] : [{ path: member.path, reason: member.failure }],
  );
  return {
    status,
    exitCode: result.exitCode,
    planValid: plan?.valid ?? false,
    planned: (plan?.members ?? []).map((member) => member.path),
    refused,
    members: [...members.values()],
    durationS: summary?.duration_s ?? result.durationMs / 1000,
    ...(totals === undefined ? {} : { totals }),
    ...(done?.execution_id === undefined ? {} : { executionId: done.execution_id }),
    ...(status === "passed" ? {} : { stderr: result.stderr.trim() }),
  };
}
