import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Behavior, BehaviorResult, Spec } from "@theseus/schema";
import { captureDir } from "./capture/index.js";
import { redraftBehaviors, type RedraftItem } from "./capture/draft.js";
import { kaneContext, originTarget, type PhaseContext } from "./context.js";
import { TheseusError } from "./errors.js";
import { isAutomationBug, isPassed, rcaRootCause } from "./kane/outcome.js";
import { runBehaviorSet } from "./kane/run.js";

export interface BaselineResult {
  /** The spec narrowed to behaviors proven on the original (some possibly redrafted). */
  readonly spec: Spec;
  /** Passing results for every behavior kept in the spec. */
  readonly results: BehaviorResult[];
  /** Behaviors dropped because they did not pass on the original. */
  readonly rejected: BehaviorResult[];
}

/**
 * Runs every drafted behavior on the original. Only what passes there becomes the
 * spec. When Kane's RCA says a failure is the test's fault (automation_bug), the
 * drafting agent rewrites that behavior once from Kane's suggested fix and Kane
 * runs it again: a closed loop between the tester and the writer.
 */
export async function baseline(ctx: PhaseContext, spec: Spec, options: { redraft: boolean }): Promise<BaselineResult> {
  const { config, deps } = ctx;
  const origin = originTarget(config);
  const kane = kaneContext(ctx, origin.id);
  const run = (behaviors: readonly Behavior[], label: string): Promise<BehaviorResult[]> => {
    ctx.ledger.ensure(behaviors.length, label);
    return runBehaviorSet(kane, behaviors, origin, { round: 0, concurrency: config.concurrency.web, artifactsPath: join(origin.id, "baseline") });
  };

  let behaviors = [...spec.behaviors];
  const results = new Map((await run(behaviors, "baseline")).map((result) => [result.behaviorId, result]));

  const redraftable: RedraftItem[] = behaviors.flatMap((behavior) => {
    const outcome = results.get(behavior.id)?.outcome;
    if (outcome === undefined || isPassed(outcome) || !isAutomationBug(outcome)) return [];
    const failure = rcaRootCause(outcome) ?? outcome.reason;
    const suggestedFix = outcome.rca?.suggestedFix;
    return [{ behavior, failure, ...(suggestedFix === undefined ? {} : { suggestedFix }) }];
  });

  if (options.redraft && redraftable.length > 0) {
    deps.bus.log(
      "info",
      `kane rca blames the test, not the app, for ${redraftable.map((item) => item.behavior.id).join(", ")}; redrafting with kane's suggested fix`,
    );
    const rewritten = await redraftBehaviors({
      agent: deps.createAgent(config.draftAgent.agent, config.draftAgent.model),
      cwd: captureDir(ctx),
      items: redraftable,
      onOutput: (text) => deps.bus.emit({ type: "agent-output", targetId: origin.id, round: 1, text }),
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    });
    const byId = new Map(rewritten.map((behavior) => [behavior.id, behavior]));
    behaviors = behaviors.map((behavior) => byId.get(behavior.id) ?? behavior);
    for (const result of await run(rewritten, "baseline redraft")) {
      results.set(result.behaviorId, result);
      deps.bus.log(
        isPassed(result.outcome) ? "info" : "warn",
        `redrafted ${result.behaviorId} ${isPassed(result.outcome) ? "now passes on the original" : `still fails: ${result.outcome.oneLiner}`}`,
      );
    }
  }

  const kept = behaviors.filter((behavior) => {
    const outcome = results.get(behavior.id)?.outcome;
    return outcome !== undefined && isPassed(outcome);
  });
  const rejected = behaviors.flatMap((behavior) => {
    const result = results.get(behavior.id);
    return result !== undefined && !isPassed(result.outcome) ? [result] : [];
  });
  for (const result of rejected) {
    deps.bus.log("warn", `dropped ${result.behaviorId}: fails on the original (${result.outcome.status}): ${result.outcome.oneLiner}`);
  }
  await writeFile(join(ctx.paths.artifacts, "baseline-rejected.json"), `${JSON.stringify(rejected, null, 2)}\n`, "utf8");
  if (kept.length === 0) throw new TheseusError("baseline-empty", "no behavior passed on the original; check the original is running and the drafted objectives");
  deps.bus.log("info", `baseline: ${kept.length}/${behaviors.length} behaviors proven on the original`);
  return {
    spec: { ...spec, behaviors: kept },
    results: kept.map((behavior) => results.get(behavior.id) as BehaviorResult),
    rejected,
  };
}
