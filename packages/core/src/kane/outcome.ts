import type { BehaviorResult, KaneOutcome } from "@theseus/schema";

export function isPassed(outcome: KaneOutcome): boolean {
  return outcome.status === "passed";
}

/** Infrastructure trouble (Kane exit 2) says nothing about the app, so it is never fed back as a build failure. */
export function isInfrastructure(outcome: KaneOutcome): boolean {
  return outcome.status === "error";
}

const RCA_PREFIX = /^\s*\[([a-z_]+)\]\s*/i;

/**
 * Kane's RCA separates test bugs from product bugs. The adapter exposes the
 * category either as a `[category] ` prefix on the root cause or as the bug category.
 */
export function rcaCategory(outcome: KaneOutcome): string | undefined {
  const prefixed = outcome.rca === undefined ? null : RCA_PREFIX.exec(outcome.rca.rootCause);
  if (prefixed?.[1] !== undefined) return prefixed[1].toLowerCase();
  return outcome.bug?.category.toLowerCase();
}

export function rcaRootCause(outcome: KaneOutcome): string | undefined {
  return outcome.rca?.rootCause.replace(RCA_PREFIX, "").trim();
}

export function isAutomationBug(outcome: KaneOutcome): boolean {
  return rcaCategory(outcome) === "automation_bug";
}

/** An outcome for a behavior Kane never got to run, such as when the build itself failed. */
export function notRunOutcome(reason: string, status: "failed" | "error" = "failed"): KaneOutcome {
  return {
    status,
    exitCode: status === "failed" ? 1 : 2,
    oneLiner: reason.split("\n")[0] ?? reason,
    reason,
    durationS: 0,
    credits: 0,
    finalState: {},
    steps: [],
    artifacts: {},
  };
}

/** The most recent result for each behavior across a sequence of result lists. */
export function latestResults(resultLists: readonly (readonly BehaviorResult[])[]): Map<string, BehaviorResult> {
  const latest = new Map<string, BehaviorResult>();
  for (const results of resultLists) {
    for (const result of results) latest.set(result.behaviorId, result);
  }
  return latest;
}
