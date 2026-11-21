import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Behavior, BehaviorResult, KaneOutcome, Target } from "@theseus/schema";
import { errorMessage, isAbortError } from "../errors.js";
import type { EventBus } from "../events/bus.js";
import type { KaneClient } from "../ports.js";
import type { StateReset } from "../state.js";
import { mapConcurrent } from "../util/concurrency.js";
import type { CreditLedger } from "./budget.js";
import { notRunOutcome } from "./outcome.js";

export interface KaneRunContext {
  readonly kane: KaneClient;
  readonly bus: EventBus;
  readonly ledger: CreditLedger;
  /** The voyage directory; artifact paths in outcomes are relative to it. */
  readonly voyageDir: string;
  /** Where Kane keeps its `.testmuai/` state, deliberately outside any clean room. */
  readonly kaneCwd: string;
  readonly timeoutS: number;
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
  /** Restores the seed before every run, set when the app keeps shared state. A failed reset aborts the batch. */
  readonly resetState?: StateReset;
}

export interface RunSetOptions {
  readonly round: number;
  readonly concurrency: number;
  /** Subdirectory of `artifacts/` for this batch, e.g. `nextjs/round-2`. */
  readonly artifactsPath: string;
  /** Emit behavior events for the TUI. Strength runs on mutants stay quiet to keep the lanes meaningful. */
  readonly emit?: boolean;
}

export async function runOne(
  ctx: KaneRunContext,
  behavior: Behavior,
  target: Target,
  options: RunSetOptions,
): Promise<BehaviorResult> {
  const emit = options.emit ?? true;
  const artifactsDir = join(ctx.voyageDir, "artifacts", options.artifactsPath, behavior.id);
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(ctx.kaneCwd, { recursive: true });
  // Not caught below: a run on leftover state would blame the app for another run's writes.
  if (ctx.resetState !== undefined) await ctx.resetState(target);
  if (emit) ctx.bus.emit({ type: "behavior-start", targetId: target.id, behaviorId: behavior.id, round: options.round });
  let outcome: KaneOutcome;
  try {
    outcome = await ctx.kane.runBehavior(behavior, target, {
      cwd: ctx.kaneCwd,
      artifactsDir,
      artifactsRoot: ctx.voyageDir,
      headless: true,
      timeoutS: ctx.timeoutS,
      ...(ctx.maxSteps === undefined ? {} : { maxSteps: ctx.maxSteps }),
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      onStep: (step) => {
        if (emit) {
          ctx.bus.emit({
            type: "kane-step",
            targetId: target.id,
            behaviorId: behavior.id,
            step: step.step,
            status: step.status,
            remark: step.remark,
          });
        }
      },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    // One broken run must not sink the whole batch; it is recorded as an infrastructure error and surfaced in the log.
    ctx.bus.log("error", `kane failed to run ${behavior.id} on ${target.id}: ${errorMessage(error)}`);
    outcome = notRunOutcome(`kane could not run this behavior: ${errorMessage(error)}`, "error");
  }
  ctx.ledger.add(outcome.credits);
  const result: BehaviorResult = { behaviorId: behavior.id, targetId: target.id, outcome };
  if (emit) ctx.bus.emit({ type: "behavior-result", targetId: target.id, round: options.round, result });
  return result;
}

export function runBehaviorSet(
  ctx: KaneRunContext,
  behaviors: readonly Behavior[],
  target: Target,
  options: RunSetOptions,
): Promise<BehaviorResult[]> {
  return mapConcurrent(behaviors, options.concurrency, (behavior) => runOne(ctx, behavior, target, options));
}
