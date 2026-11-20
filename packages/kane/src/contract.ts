import type { Behavior, KaneOutcome, Target } from "@theseus/schema";

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
}
