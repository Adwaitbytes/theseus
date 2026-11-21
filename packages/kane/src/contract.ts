import type { Behavior, KaneOutcome, Target } from "@theseus/schema";
import type { DeviceSelection } from "./command.js";

/**
 * Public contract of @theseus/kane. The engine (@theseus/core) codes against this
 * file only, so the adapter's internals can change without touching callers.
 */

export interface KaneStepEvent {
  readonly step: number;
  readonly status: "running" | "done" | "failed";
  readonly remark: string;
}

export interface RunBehaviorOptions {
  /** Directory the run executes in; Kane writes `.testmuai/` state here. */
  readonly cwd: string;
  /** Where screenshots and the evidence pack are copied, relative paths are stored in the outcome. */
  readonly artifactsDir: string;
  /** Base for the relative artifact paths written into the outcome (the voyage directory). */
  readonly artifactsRoot: string;
  readonly headless?: boolean;
  /** Our own wall-clock limit; Kane's `--timeout` is not trusted to fire (issues #138, #207). */
  readonly timeoutS?: number;
  readonly maxSteps?: number;
  readonly bugDetection?: "off" | "continue";
  readonly signal?: AbortSignal;
  readonly onStep?: (event: KaneStepEvent) => void;
}

/** How a member of a suite ended (references/testrun.md, `testrun_member_end.status`). */
export type SuiteMemberStatus = "passed" | "failed" | "broken" | "interrupted";

export interface SuiteMember {
  /** The path as Kane reported it; relative in the authoring pass, absolute in the replay pass. */
  readonly path: string;
  /** The `_test.md` file name, the stable key across both passes. */
  readonly file: string;
  readonly status: SuiteMemberStatus;
  readonly durationS: number;
  /** True when the test had no recording yet and was authored in the pass after the replays. */
  readonly authored: boolean;
  readonly testId?: string;
  /** This member's own event log; read it, not the suite stream, to diagnose a failure. */
  readonly logPath?: string;
  readonly failure?: { readonly message: string; readonly stepIndex?: number };
}

export interface SuiteTotals {
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly broken: number;
  readonly skipped: number;
  readonly authored: number;
}

/** `timeout` is our own wall clock firing; `cancelled` is Kane's exit 3. */
export type SuiteStatus = "passed" | "failed" | "error" | "cancelled" | "timeout";

export interface SuiteResult {
  readonly status: SuiteStatus;
  readonly exitCode: number | null;
  /** False when preflight refused the plan; nothing ran and `refused` says why. */
  readonly planValid: boolean;
  readonly planned: readonly string[];
  readonly refused: readonly { readonly path: string; readonly reason: string }[];
  readonly members: readonly SuiteMember[];
  readonly durationS: number;
  readonly totals?: SuiteTotals;
  readonly executionId?: string;
  /** kane-cli's stderr when the suite did not pass, for usage and auth errors that never reach the stream. */
  readonly stderr?: string;
}

export type SuiteMemberEvent =
  | { readonly kind: "start"; readonly path: string }
  | { readonly kind: "end"; readonly member: SuiteMember };

export interface RunSuiteOptions {
  /**
   * Directory holding the committed `_test.md` files. It is also the working directory, so Kane's
   * recordings (`output-<stem>/`) land beside the tests and later runs replay instead of re-authoring.
   */
  readonly dir: string;
  /** File names inside `dir`; defaults to every `*_test.md` directly in it. */
  readonly files?: readonly string[];
  /** Worker count; Kane refuses more than 1 for local emulator or simulator members. */
  readonly parallel?: number;
  readonly headless?: boolean;
  /** Run title on the Kane dashboard. */
  readonly name?: string;
  readonly onFailure?: "continue" | "fail-fast";
  readonly device?: DeviceSelection;
  /** Our own wall-clock limit for the whole suite. */
  readonly timeoutS?: number;
  readonly signal?: AbortSignal;
  readonly onMember?: (event: SuiteMemberEvent) => void;
}

export interface KaneClient {
  /** `kane-cli --version`, used for provenance in every voyage. */
  version(): Promise<string>;
  /** Credits left on the logged-in account, or an error if not logged in. */
  balance(): Promise<number>;
  /**
   * Runs one behavior against one target and returns a normalized outcome.
   * Infrastructure failures (exit 2) are retried with backoff before surfacing as `error`.
   */
  runBehavior(behavior: Behavior, target: Target, options: RunBehaviorOptions): Promise<KaneOutcome>;
  /** Writes the spec as committed Kane `_test.md` files, one per behavior, for a given target. */
  exportTestMd(behaviors: readonly Behavior[], target: Target, outDir: string): Promise<string[]>;
  /**
   * Runs exported `_test.md` files as one Kane suite (`kane-cli testrun run --agent`): one plan,
   * one exit code, one sealed evidence pack. Added so a regrown app's proof can be re-run
   * Kane-natively, in CI too, from the committed files without Theseus driving each behavior.
   * Never retried: exit 2 here is an invalid plan or a missing sign-in, which a retry cannot fix.
   */
  runSuite(options: RunSuiteOptions): Promise<SuiteResult>;
}
