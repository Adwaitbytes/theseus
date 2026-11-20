import { KaneOutcome, type KaneBug, type KaneStatus } from "@theseus/schema";
import { z } from "zod";
import { expandHome, type ExtractedEvidence } from "./evidence.js";
import type { ErrorEvent, KaneEvent, ProgressLine, RunEnd, Verdict } from "./ndjson.js";
import { statusFromExit, type KaneProcessResult } from "./process.js";

export interface NormalizeInput {
  /** Every attempt in order; the last one is the outcome, earlier ones were retried infrastructure failures. */
  readonly attempts: readonly KaneProcessResult[];
  readonly stores: readonly string[];
  readonly timeoutS: number;
  readonly evidence?: ExtractedEvidence | undefined;
}

/** Kane's result code for a bug confirmed under `--bug-detection`. */
const CONFIRMED_BUG = "740";

type EventOf<K extends KaneEvent["kind"]> = Extract<KaneEvent, { kind: K }>["event"];

function eventsOf<K extends KaneEvent["kind"]>(events: readonly KaneEvent[], kind: K): EventOf<K>[] {
  const matching: EventOf<K>[] = [];
  for (const event of events) {
    if (event.kind === kind) matching.push(event.event as EventOf<K>);
  }
  return matching;
}

export function findRunEnd(events: readonly KaneEvent[]): RunEnd | undefined {
  return eventsOf(events, "run_end").at(-1);
}

function creditsOf(runEnd: RunEnd | undefined): number {
  return runEnd?.credits_consumed ?? runEnd?.credits ?? 0;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function finalStateOf(runEnd: RunEnd | undefined): Record<string, string> {
  const state: Record<string, string> = {};
  for (const [key, value] of Object.entries(runEnd?.final_state ?? {})) state[key] = stringify(value);
  return state;
}

function completedSteps(progress: readonly ProgressLine[]): KaneOutcome["steps"] {
  const steps: KaneOutcome["steps"] = [];
  for (const line of progress) {
    if (line.status === "done" || line.status === "failed") {
      steps.push({ index: line.step, status: line.status, remark: line.remark });
    }
  }
  return steps;
}

function bugOf(runEnd: RunEnd | undefined): KaneBug | undefined {
  const verdict: Verdict | undefined = runEnd?.verdict;
  if (runEnd?.result_code !== CONFIRMED_BUG || verdict === undefined) return undefined;
  const confidence = typeof verdict.confidence === "number" ? verdict.confidence : Number(verdict.confidence);
  return {
    category: verdict.category ?? verdict.family ?? "unknown",
    severity: verdict.severity ?? "unknown",
    oneLiner: verdict.one_liner ?? runEnd.one_liner ?? "",
    ...(Number.isFinite(confidence) ? { confidence } : {}),
  };
}

/** The run_end verdict's triage, used when the evidence pack had no failure record to read. */
function verdictRca(runEnd: RunEnd | undefined): KaneOutcome["rca"] {
  const verdict = runEnd?.verdict;
  if (verdict?.root_cause === undefined) return undefined;
  const prefix = verdict.family === undefined ? "" : `[${verdict.family}] `;
  return { rootCause: `${prefix}${verdict.root_cause}`, suggestedFix: verdict.suggestion ?? "" };
}

const Url = z.string().url();

function lastStderrLine(stderr: string): string | undefined {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("evidence:") && !line.startsWith("Skill update available"))
    .at(-1);
}

function baseReason(
  status: KaneStatus,
  last: KaneProcessResult,
  runEnd: RunEnd | undefined,
  errors: readonly ErrorEvent[],
  input: NormalizeInput,
): string {
  if (last.timedOut) return `Exceeded the ${input.timeoutS}s wall-clock limit; the run was killed.`;
  const detail =
    runEnd?.reason ?? errors.at(-1)?.message ?? lastStderrLine(last.stderr) ?? `kane-cli exited with code ${String(last.exitCode)}`;
  if (status === "error" && input.attempts.length > 1) {
    return `Infrastructure error after ${input.attempts.length} attempts: ${detail}`;
  }
  return detail;
}

/** The exit code decides, except that a clean exit whose run_end says otherwise is not a pass. */
export function outcomeStatus(result: KaneProcessResult): KaneStatus {
  const status = statusFromExit(result.exitCode, result.timedOut);
  const runEnd = findRunEnd(result.events);
  return status === "passed" && runEnd !== undefined && runEnd.status !== "passed" ? "failed" : status;
}

/** Folds a finished Kane process (and its extracted evidence) into a schema-valid KaneOutcome. */
export function normalizeOutcome(input: NormalizeInput): KaneOutcome {
  const last = input.attempts.at(-1);
  if (last === undefined) throw new Error("normalizeOutcome needs at least one attempt");
  const runEnd = findRunEnd(last.events);
  const errors = eventsOf(last.events, "error");
  const progress = eventsOf(last.events, "progress");

  const status = outcomeStatus(last);

  const finalState = finalStateOf(runEnd);
  const notes: string[] = [];
  const missing = input.stores.filter((key) => !(key in finalState));
  if (missing.length > 0) notes.push(`Missing stored values: ${missing.join(", ")}.`);
  notes.push(...(input.evidence?.warnings ?? []));

  const steps = completedSteps(progress);
  const failed = steps.filter((step) => step.status === "failed").at(-1);
  const reason = [baseReason(status, last, runEnd, errors, input), ...notes].join(" ");
  const sessionDir = runEnd?.session_dir ?? eventsOf(last.events, "stream_start").at(-1)?.session_dir;
  const testUrl = Url.safeParse(runEnd?.test_url);
  const bug = bugOf(runEnd);
  const rca = input.evidence?.rca ?? (status === "passed" ? undefined : verdictRca(runEnd));

  return KaneOutcome.parse({
    status,
    // A run we killed has no exit code; 3 is Kane's own code for a timeout.
    exitCode: last.exitCode ?? (last.timedOut ? 3 : -1),
    oneLiner: runEnd?.one_liner ?? runEnd?.summary ?? reason,
    reason,
    durationS: runEnd?.duration ?? last.durationMs / 1000,
    credits: input.attempts.reduce((sum, attempt) => sum + creditsOf(findRunEnd(attempt.events)), 0),
    finalState,
    steps,
    ...(failed === undefined ? {} : { failingStep: { index: failed.index, remark: failed.remark } }),
    ...(bug === undefined ? {} : { bug }),
    ...(testUrl.success ? { testUrl: testUrl.data } : {}),
    ...(sessionDir === undefined ? {} : { sessionDir: expandHome(sessionDir) }),
    ...(rca === undefined ? {} : { rca }),
    artifacts: input.evidence?.artifacts ?? {},
  });
}
