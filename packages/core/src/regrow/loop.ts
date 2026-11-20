import type { AgentInfo, Behavior, BehaviorResult, Regrowth, Round, Spec, Target } from "@theseus/schema";
import type { BuilderAgent } from "../agents/types.js";
import type { TargetConfig } from "../config.js";
import { throwIfAborted } from "../errors.js";
import type { Clock, EventBus } from "../events/bus.js";
import type { CreditLedger } from "../kane/budget.js";
import { isInfrastructure, isPassed, latestResults, notRunOutcome } from "../kane/outcome.js";
import { buildFeedbackPrompt, buildInitialPrompt, type FeedbackItem } from "./prompts.js";

export const BUILD_FAILED = "build failed";

export type PreparedApp =
  | { readonly ok: true; readonly target: Target; stop(): Promise<void> }
  | { readonly ok: false; readonly error: string };

export interface DiffStat {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface RegrowLoopDeps {
  readonly agent: BuilderAgent;
  readonly bus: EventBus;
  readonly ledger: CreditLedger;
  readonly clock: Clock;
  readonly prepareApp: (round: number) => Promise<PreparedApp>;
  readonly runBehaviors: (behaviors: readonly Behavior[], target: Target, round: number) => Promise<BehaviorResult[]>;
  readonly commit: (message: string) => Promise<{ commit?: string; diffStat: DiffStat }>;
  /** Copies a failure screenshot into the workspace and returns its workspace-relative path. */
  readonly stageFailShot: (result: BehaviorResult, round: number) => Promise<string | undefined>;
  readonly persist: (regrowth: Regrowth) => Promise<void>;
}

export interface RegrowLoopInput {
  readonly spec: Spec;
  readonly targetConfig: TargetConfig;
  readonly target: Target;
  readonly agentInfo: AgentInfo;
  readonly workspace: string;
  readonly maxRounds: number;
  /** A partial regrowth from an interrupted run; the loop continues where it stopped. */
  readonly existing?: Regrowth;
  readonly signal?: AbortSignal;
}

/** Round 1 and every round that carries feedback had a builder pass; a full regression pass does not. */
export function isBuildRound(round: Round): boolean {
  return round.n === 1 || round.feedback !== undefined;
}

export type NextStep =
  | { readonly kind: "build"; readonly run: readonly Behavior[] }
  | { readonly kind: "regression" }
  | { readonly kind: "done"; readonly green: boolean };

/**
 * Kane runs cost real credits, so a round reruns only what is still failing. Once
 * every behavior has passed at least once, one full regression pass on the same
 * code confirms nothing broke along the way; that pass is what parity reads.
 */
export function nextStep(behaviors: readonly Behavior[], rounds: readonly Round[], maxRounds: number): NextStep {
  if (rounds.length === 0) return { kind: "build", run: behaviors };
  const latest = latestResults(rounds.map((round) => round.results));
  const failing = behaviors.filter((behavior) => {
    const result = latest.get(behavior.id);
    return result === undefined || !isPassed(result.outcome);
  });
  if (failing.length === 0) {
    const last = rounds.at(-1);
    const coveredAll = last !== undefined && behaviors.every((behavior) => last.results.some((result) => result.behaviorId === behavior.id));
    return coveredAll ? { kind: "done", green: true } : { kind: "regression" };
  }
  if (rounds.filter(isBuildRound).length >= maxRounds) return { kind: "done", green: false };
  return { kind: "build", run: failing };
}

function provenCount(behaviors: readonly Behavior[], rounds: readonly Round[]): number {
  const latest = latestResults(rounds.map((round) => round.results));
  return behaviors.filter((behavior) => {
    const result = latest.get(behavior.id);
    return result !== undefined && isPassed(result.outcome);
  }).length;
}

function lastBuildError(rounds: readonly Round[]): string | undefined {
  const last = rounds.at(-1);
  const first = last?.results[0]?.outcome;
  if (first === undefined || !first.reason.startsWith(BUILD_FAILED)) return undefined;
  return first.reason.slice(BUILD_FAILED.length).replace(/^:\s*/, "");
}

async function feedbackFor(
  behaviors: readonly Behavior[],
  rounds: readonly Round[],
  deps: RegrowLoopDeps,
  round: number,
): Promise<string | undefined> {
  const passed = provenCount(behaviors, rounds);
  const buildError = lastBuildError(rounds);
  if (buildError !== undefined) {
    return buildFeedbackPrompt({ round, passed, total: behaviors.length, failures: [], buildError });
  }
  const latest = latestResults(rounds.map((r) => r.results));
  const failures: FeedbackItem[] = [];
  for (const behavior of behaviors) {
    const result = latest.get(behavior.id);
    if (result === undefined || isPassed(result.outcome) || isInfrastructure(result.outcome)) continue;
    const failShot = await deps.stageFailShot(result, round);
    failures.push({ behavior, result, ...(failShot === undefined ? {} : { failShot }) });
  }
  if (failures.length === 0) return undefined;
  return buildFeedbackPrompt({ round, passed, total: behaviors.length, failures });
}

export async function runRegrowLoop(input: RegrowLoopInput, deps: RegrowLoopDeps): Promise<Regrowth> {
  const behaviors = input.spec.behaviors;
  const rounds: Round[] = [...(input.existing?.rounds ?? [])];
  const startedAt = input.existing?.startedAt ?? deps.clock.now().toISOString();
  const snapshot = (): Regrowth => ({
    id: input.target.id,
    target: input.target,
    agent: input.agentInfo,
    startedAt,
    endedAt: deps.clock.now().toISOString(),
    rounds: [...rounds],
    creditsUsed: rounds.reduce((sum, round) => sum + round.results.reduce((acc, result) => acc + result.outcome.credits, 0), 0),
  });

  for (;;) {
    throwIfAborted(input.signal);
    const step = nextStep(behaviors, rounds, input.maxRounds);
    if (step.kind === "done") {
      deps.bus.log(
        step.green ? "info" : "warn",
        step.green
          ? `${input.target.id}: all ${behaviors.length} behaviors proven`
          : `${input.target.id}: stopped after ${input.maxRounds} rounds with ${provenCount(behaviors, rounds)}/${behaviors.length} proven`,
      );
      const final = snapshot();
      await deps.persist(final);
      return final;
    }

    const n = rounds.length + 1;
    const toRun = step.kind === "build" ? step.run : behaviors;
    deps.ledger.ensure(toRun.length, `${input.target.id} round ${n}`);
    const roundStartedAt = deps.clock.now().toISOString();
    deps.bus.emit({ type: "round-start", targetId: input.target.id, round: n });

    let feedback: string | undefined;
    if (step.kind === "build") {
      feedback = n === 1 ? undefined : await feedbackFor(behaviors, rounds, deps, n);
      const prompt = n === 1 ? buildInitialPrompt(input.targetConfig) : feedback;
      if (prompt === undefined) {
        deps.bus.log("info", `${input.target.id} round ${n}: only infrastructure errors last round, rerunning without a rebuild`);
        feedback = "rerun after infrastructure errors, no builder pass";
      } else {
        const { exitCode } = await deps.agent.run({
          cwd: input.workspace,
          prompt,
          onOutput: (text) => deps.bus.emit({ type: "agent-output", targetId: input.target.id, round: n, text }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        if (exitCode !== 0) deps.bus.log("warn", `${input.target.id} round ${n}: builder exited with ${exitCode}, verifying what it left`);
      }
    } else {
      deps.bus.log("info", `${input.target.id} round ${n}: every behavior has passed once, running the full regression pass`);
    }

    const app = await deps.prepareApp(n);
    let results: BehaviorResult[];
    if (app.ok) {
      try {
        results = await deps.runBehaviors(toRun, app.target, n);
      } finally {
        await app.stop();
      }
    } else {
      deps.bus.log("warn", `${input.target.id} round ${n}: ${BUILD_FAILED}`);
      results = toRun.map((behavior) => {
        const result: BehaviorResult = {
          behaviorId: behavior.id,
          targetId: input.target.id,
          outcome: notRunOutcome(`${BUILD_FAILED}: ${app.error}`),
        };
        deps.bus.emit({ type: "behavior-result", targetId: input.target.id, round: n, result });
        return result;
      });
    }

    const roundsWithThis = [...rounds, { n, startedAt: roundStartedAt, endedAt: roundStartedAt, diffStat: { files: 0, additions: 0, deletions: 0 }, results }];
    const proven = provenCount(behaviors, roundsWithThis);
    const { commit, diffStat } = await deps.commit(`round ${n}: ${proven}/${behaviors.length} behaviors proven (kane)`);
    rounds.push({
      n,
      startedAt: roundStartedAt,
      endedAt: deps.clock.now().toISOString(),
      ...(commit === undefined ? {} : { commit }),
      diffStat,
      results,
      ...(feedback === undefined ? {} : { feedback }),
    });
    deps.bus.emit({ type: "round-end", targetId: input.target.id, round: n, passed: proven, total: behaviors.length });
    await deps.persist(snapshot());
  }
}
