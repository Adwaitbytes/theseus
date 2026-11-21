import type { Behavior, KaneOutcome, Target } from "@theseus/schema";
import { buildObjective, buildRunArgs, type DeviceSelection } from "./command.js";
import type { KaneClient, KaneStepEvent, RunBehaviorOptions } from "./contract.js";
import { KaneCommandError, NotLoggedInError } from "./errors.js";
import { extractEvidence, locatePack } from "./evidence.js";
import type { KaneEvent } from "./ndjson.js";
import { findRunEnd, normalizeOutcome, outcomeStatus } from "./outcome.js";
import { DEFAULT_RETRY, runKaneProcess, runKaneWithRetry, type RetryPolicy } from "./process.js";
import { runKaneSuite } from "./suite.js";
import { writeTestMdFiles } from "./testmd.js";

export interface KaneClientOptions {
  /** The kane-cli executable; defaults to `kane-cli` on PATH. */
  readonly bin?: string;
  /** Environment for every kane-cli process; defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Backoff for exit-2 infrastructure failures and Kane browser crashes; defaults to 3 attempts from 2 s. */
  readonly retry?: RetryPolicy;
  /** Devices for local runs; agent-mode mobile runs need one here or saved with `kane-cli config`. */
  readonly devices?: { readonly android?: DeviceSelection; readonly ios?: DeviceSelection };
  /** Extra wall-clock time past Kane's own `--timeout` before we kill the process group. */
  readonly killMarginS?: number;
}

const DEFAULT_TIMEOUT_S = 600;
const DEFAULT_KILL_MARGIN_S = 30;
const QUICK_COMMAND_TIMEOUT_MS = 60_000;
const NOT_LOGGED_IN = /not authenticated|could not resolve credentials|not logged in/i;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function stepEvent(event: KaneEvent): KaneStepEvent | undefined {
  if (event.kind !== "progress") return undefined;
  const { step, status, remark } = event.event;
  if (status !== "running" && status !== "done" && status !== "failed") return undefined;
  return { step, status, remark };
}

export function parseBalance(stdout: string): number | undefined {
  const match = /Available credits:\s*(-?[\d,]*\.?\d+)/i.exec(stdout.replace(ANSI, ""));
  if (match?.[1] === undefined) return undefined;
  const credits = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(credits) ? credits : undefined;
}

export function createKaneClient(options: KaneClientOptions = {}): KaneClient {
  const bin = options.bin ?? "kane-cli";
  // Kane attributes runs to the calling tool through this variable (kane-cli skill, SKILL.md 1.2).
  const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env), KANE_CLI_USER_AGENT: "theseus" };
  const retry = options.retry ?? DEFAULT_RETRY;
  const killMarginS = options.killMarginS ?? DEFAULT_KILL_MARGIN_S;

  const quick = (args: string[]) => runKaneProcess({ bin, args, env, timeoutMs: QUICK_COMMAND_TIMEOUT_MS });

  return {
    async version() {
      const result = await quick(["--version"]);
      const version = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/.exec(result.stdout)?.[0];
      if (result.exitCode !== 0 || version === undefined) {
        throw new KaneCommandError("kane-cli --version gave no version", result.exitCode, result.stderr);
      }
      return version;
    },

    async balance() {
      // `kane-cli balance` has no --agent or --json on 0.10.7: it prints `Available credits: <n>` (exit 0),
      // or "Not authenticated [<env>]. Run "kane-cli login" first." on stderr (exit 2).
      const result = await quick(["balance"]);
      const output = `${result.stdout}\n${result.stderr}`;
      if (NOT_LOGGED_IN.test(output)) throw new NotLoggedInError(result.stderr.trim() || "kane-cli is not logged in");
      const credits = result.exitCode === 0 ? parseBalance(result.stdout) : undefined;
      if (credits === undefined) {
        throw new KaneCommandError("Could not read the credit balance from kane-cli", result.exitCode, result.stderr);
      }
      return credits;
    },

    async runBehavior(behavior: Behavior, target: Target, runOptions: RunBehaviorOptions): Promise<KaneOutcome> {
      const timeoutS = runOptions.timeoutS ?? DEFAULT_TIMEOUT_S;
      const device = target.platform === "web" ? undefined : options.devices?.[target.platform];
      const args = buildRunArgs(buildObjective(behavior), target, {
        headless: runOptions.headless,
        maxSteps: runOptions.maxSteps,
        bugDetection: runOptions.bugDetection,
        timeoutS,
        device,
      });
      const { onStep } = runOptions;

      const attempts = await runKaneWithRetry(
        {
          bin,
          args,
          cwd: runOptions.cwd,
          env,
          // Kane gets its own --timeout so it can seal the pack; our kill is the backstop when it does not fire.
          timeoutMs: (timeoutS + killMarginS) * 1000,
          ...(runOptions.signal === undefined ? {} : { signal: runOptions.signal }),
          ...(onStep === undefined
            ? {}
            : {
                onEvent: (event: KaneEvent) => {
                  const step = stepEvent(event);
                  if (step !== undefined) onStep(step);
                },
              }),
        },
        retry,
      );

      const last = attempts.at(-1);
      if (last === undefined) throw new Error("runKaneWithRetry returned no attempts");
      const runEnd = findRunEnd(last.events);
      const coverage = last.events.flatMap((event) => (event.kind === "coverage" ? [event.event] : [])).at(-1);
      let packPath: string | undefined;
      let locateWarning: string | undefined;
      try {
        packPath = await locatePack({
          stderr: last.stderr,
          coveragePack: coverage?.pack,
          sessionDir: runEnd?.session_dir,
          cwd: runOptions.cwd,
        });
      } catch (error) {
        // Evidence is best effort: a verdict must still come back when the pack cannot be found.
        locateWarning = `Evidence pack lookup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      const extracted = await extractEvidence({
        packPath,
        failed: outcomeStatus(last) !== "passed",
        artifactsDir: runOptions.artifactsDir,
        artifactsRoot: runOptions.artifactsRoot,
        baseName: behavior.id,
      });
      const evidence =
        locateWarning === undefined ? extracted : { ...extracted, warnings: [locateWarning, ...extracted.warnings] };
      return normalizeOutcome({ attempts, stores: behavior.stores, timeoutS, evidence });
    },

    exportTestMd(behaviors, target, outDir) {
      return writeTestMdFiles(behaviors, target, outDir);
    },

    runSuite(suiteOptions) {
      return runKaneSuite(bin, env, suiteOptions);
    },
  };
}
