import type { AgentInfo, Behavior, BehaviorResult, Platform, Regrowth, Voyage } from "@theseus/schema";
import { isPassed, latestResults } from "./kane/outcome.js";

/** One agent's run in a race, derived entirely from its Regrowth. */
export interface RaceEntry {
  readonly targetId: string;
  readonly label: string;
  readonly agent: AgentInfo["name"];
  readonly model: string;
  /** The first round after which every behavior's latest result had passed; undefined if it never went green. */
  readonly roundsToGreen: number | undefined;
  readonly rounds: number;
  readonly passed: number;
  readonly total: number;
  /** Undefined until parity has been computed for this target. */
  readonly parityIdentical: number | undefined;
  readonly credits: number;
}

/** Targets that share a stack and platform but were built by different agents. */
export interface Race {
  readonly stack: string;
  readonly platform: Platform;
  readonly entries: readonly RaceEntry[];
  /** The best entry, or undefined when the leaders tie or nobody went green. */
  readonly winner: string | undefined;
}

export function roundsToGreen(behaviors: readonly Behavior[], regrowth: Regrowth): number | undefined {
  const latest = new Map<string, BehaviorResult>();
  for (const round of regrowth.rounds) {
    for (const result of round.results) latest.set(result.behaviorId, result);
    const green = behaviors.every((behavior) => {
      const result = latest.get(behavior.id);
      return result !== undefined && isPassed(result.outcome);
    });
    if (green && behaviors.length > 0) return round.n;
  }
  return undefined;
}

function entryOf(behaviors: readonly Behavior[], regrowth: Regrowth): RaceEntry {
  const latest = latestResults(regrowth.rounds.map((round) => round.results));
  const passed = behaviors.filter((behavior) => {
    const result = latest.get(behavior.id);
    return result !== undefined && isPassed(result.outcome);
  }).length;
  return {
    targetId: regrowth.id,
    label: regrowth.target.label,
    agent: regrowth.agent.name,
    model: regrowth.agent.model,
    roundsToGreen: roundsToGreen(behaviors, regrowth),
    rounds: regrowth.rounds.length,
    passed,
    total: behaviors.length,
    parityIdentical: regrowth.parity?.summary.identical,
    credits: regrowth.creditsUsed,
  };
}

/** Lower is better on every axis: green first, then fewer rounds, more identical parity, fewer credits. */
function rank(entry: RaceEntry): readonly number[] {
  return [
    entry.roundsToGreen === undefined ? 1 : 0,
    entry.roundsToGreen ?? Number.POSITIVE_INFINITY,
    -(entry.parityIdentical ?? entry.passed),
    -entry.passed,
    entry.credits,
  ];
}

function compareRank(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function winnerOf(entries: readonly RaceEntry[]): string | undefined {
  const ranked = [...entries].sort((a, b) => compareRank(rank(a), rank(b)));
  const [first, second] = ranked;
  if (first === undefined || first.roundsToGreen === undefined) return undefined;
  if (second !== undefined && compareRank(rank(first), rank(second)) === 0) return undefined;
  return first.targetId;
}

/**
 * Finds every race in a voyage. The schema has no race field: a race is simply two or more
 * regrowths with the same stack and platform whose builder agents differ.
 */
export function raceSummary(voyage: Voyage): Race[] {
  const groups = new Map<string, Regrowth[]>();
  for (const regrowth of voyage.regrowths) {
    const key = `${regrowth.target.platform}\u0000${regrowth.target.stack}`;
    groups.set(key, [...(groups.get(key) ?? []), regrowth]);
  }
  const races: Race[] = [];
  for (const regrowths of groups.values()) {
    const agents = new Set(regrowths.map((regrowth) => `${regrowth.agent.name}\u0000${regrowth.agent.model}`));
    const first = regrowths[0];
    if (first === undefined || regrowths.length < 2 || agents.size < 2) continue;
    const entries = regrowths.map((regrowth) => entryOf(voyage.spec.behaviors, regrowth));
    races.push({ stack: first.target.stack, platform: first.target.platform, entries, winner: winnerOf(entries) });
  }
  return races;
}
