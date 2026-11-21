import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Behavior, KaneOutcome, ParityValue, Target, Voyage } from "@theseus/schema";
import { TheseusError, errorMessage, isAbortError } from "./errors.js";
import { notRunOutcome } from "./kane/outcome.js";
import { compareValues } from "./parity.js";
import type { KaneClient, KaneStepEvent, MobileBuilder } from "./ports.js";
import type { AppLauncher } from "./regrow/launcher.js";
import { finalResultsOf } from "./voyage/index.js";

/** `original` always names the original, whatever id the voyage gave it. */
export const ORIGINAL_ALIAS = "original";

/** One certificate cell proven twice: what voyage.json recorded and what Kane sees now. */
export interface CellComparison {
  readonly behaviorId: string;
  readonly targetId: string;
  readonly recorded: KaneOutcome;
  readonly fresh: KaneOutcome;
  readonly statusMatch: boolean;
  /** Stored values compared on the behavior's declared keys, recorded on the left. */
  readonly values: readonly ParityValue[];
  readonly match: boolean;
}

export interface VerifyTarget {
  readonly target: Target;
  readonly isOriginal: boolean;
}

/** Finds a target in a voyage by id, accepting `original` for the original. */
export function resolveVerifyTarget(voyage: Voyage, id: string): VerifyTarget {
  const origin = voyage.spec.app.origin;
  if (id === ORIGINAL_ALIAS || id === origin.id) return { target: origin, isOriginal: true };
  const regrowth = voyage.regrowths.find((candidate) => candidate.id === id);
  if (regrowth === undefined) {
    const known = [ORIGINAL_ALIAS, ...voyage.regrowths.map((candidate) => candidate.id)];
    throw new TheseusError("config-invalid", `voyage ${voyage.id} has no target "${id}"; known: ${known.join(", ")}`);
  }
  return { target: regrowth.target, isOriginal: false };
}

export function requireBehavior(voyage: Voyage, id: string): Behavior {
  const behavior = voyage.spec.behaviors.find((candidate) => candidate.id === id);
  if (behavior === undefined) {
    throw new TheseusError("config-invalid", `voyage ${voyage.id} has no behavior "${id}"; run theseus verify <run> --all to see them all`);
  }
  return behavior;
}

/**
 * The outcome the certificate cell was built from: the baseline for the original, and for a regrown
 * target the parity row's candidate (falling back to its final round results before parity ran).
 */
export function recordedOutcome(voyage: Voyage, behaviorId: string, targetId: string): KaneOutcome {
  const { isOriginal } = resolveVerifyTarget(voyage, targetId);
  if (isOriginal) {
    return voyage.baseline.find((result) => result.behaviorId === behaviorId)?.outcome ?? notRunOutcome("not run in the baseline");
  }
  const regrowth = voyage.regrowths.find((candidate) => candidate.id === targetId);
  const row = regrowth?.parity?.rows.find((candidate) => candidate.behaviorId === behaviorId);
  if (row !== undefined) return row.candidate;
  const final = regrowth === undefined ? undefined : finalResultsOf(regrowth).find((result) => result.behaviorId === behaviorId);
  return final?.outcome ?? notRunOutcome("not run on this target");
}

/**
 * A cell holds when Kane reaches the same verdict, and, for a pass, stores the same values under
 * every declared key. A failure that fails again counts as holding: the certificate said it failed.
 */
export function compareCell(behavior: Behavior, targetId: string, recorded: KaneOutcome, fresh: KaneOutcome): CellComparison {
  const statusMatch = recorded.status === fresh.status;
  const values = compareValues(behavior.stores, recorded.finalState, fresh.finalState);
  const valuesMatch = recorded.status !== "passed" || values.every((value) => value.equal);
  return { behaviorId: behavior.id, targetId, recorded, fresh, statusMatch, values, match: statusMatch && valuesMatch };
}

export interface LiveTargetOptions {
  /** A running deployment to verify instead of launching one; web targets only. */
  readonly url?: string;
  /** A built app to verify instead of building one; mobile targets only. */
  readonly app?: string;
  /** The target's clean-room workspace, used to launch or build it when neither override is given. */
  readonly workspace: string;
  readonly launcher: AppLauncher;
  readonly mobile?: MobileBuilder;
  readonly signal?: AbortSignal;
  readonly onLog?: (line: string) => void;
}

export interface LiveTarget {
  readonly target: Target;
  stop(): Promise<void>;
}

/** Makes a recorded target runnable again: the original at its URL, a regrown app from its workspace. */
export async function prepareLiveTarget(resolved: VerifyTarget, options: LiveTargetOptions): Promise<LiveTarget> {
  const { target } = resolved;
  const none = async (): Promise<void> => {};
  if (target.platform === "web") {
    if (options.app !== undefined) throw new TheseusError("config-invalid", `--app applies to mobile targets; ${target.id} is a web target`);
    if (options.url !== undefined) return { target: { ...target, url: options.url }, stop: none };
    if (resolved.isOriginal) {
      if (target.url === undefined) throw new TheseusError("config-invalid", "the original has no URL in voyage.json; pass --url");
      return { target, stop: none };
    }
    const app = await options.launcher.launchNpmApp(options.workspace, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
    });
    return { target: { ...target, url: app.url }, stop: () => app.stop() };
  }
  if (options.url !== undefined) throw new TheseusError("config-invalid", `--url applies to web targets; ${target.id} is ${target.platform}`);
  if (options.app !== undefined) return { target: { ...target, app: options.app }, stop: none };
  if (options.mobile === undefined) {
    throw new TheseusError("phase-precondition", `${target.id} is ${target.platform}; pass --app or install @theseus/mobile to build it`);
  }
  await options.mobile.ensureDevice(target.platform);
  const { appPath } = await options.mobile.buildExpo(options.workspace, target.platform);
  return { target: { ...target, app: appPath }, stop: none };
}

export interface VerifyRunOptions {
  readonly kane: KaneClient;
  /** Where Kane runs and where fresh evidence is kept, outside the committed run directory. */
  readonly workDir: string;
  readonly timeoutS: number;
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
  readonly onStep?: (behaviorId: string, event: KaneStepEvent) => void;
  readonly onResult?: (comparison: CellComparison) => void;
}

/** Re-runs each behavior on a live target, one at a time, and compares it with the recorded cell. */
export async function verifyCells(
  voyage: Voyage,
  behaviors: readonly Behavior[],
  live: LiveTarget,
  recordedTargetId: string,
  options: VerifyRunOptions,
): Promise<CellComparison[]> {
  const comparisons: CellComparison[] = [];
  const kaneCwd = join(options.workDir, ".kane");
  await mkdir(kaneCwd, { recursive: true });
  for (const behavior of behaviors) {
    const artifactsDir = join(options.workDir, "artifacts", behavior.id);
    await mkdir(artifactsDir, { recursive: true });
    let fresh: KaneOutcome;
    try {
      fresh = await options.kane.runBehavior(behavior, live.target, {
        cwd: kaneCwd,
        artifactsDir,
        artifactsRoot: options.workDir,
        headless: true,
        timeoutS: options.timeoutS,
        ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onStep === undefined ? {} : { onStep: (event: KaneStepEvent) => options.onStep?.(behavior.id, event) }),
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      fresh = notRunOutcome(`kane could not run this behavior: ${errorMessage(error)}`, "error");
    }
    const comparison = compareCell(behavior, recordedTargetId, recordedOutcome(voyage, behavior.id, recordedTargetId), fresh);
    options.onResult?.(comparison);
    comparisons.push(comparison);
  }
  return comparisons;
}
