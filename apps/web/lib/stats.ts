import type { ParityReport, Regrowth, Voyage } from "@theseus/schema";

export interface TargetSummary {
  id: string;
  label: string;
  stack: string;
  platform: Regrowth["target"]["platform"];
  agent: Regrowth["agent"];
  rounds: number;
  finalPassed: number;
  total: number;
  failuresFedBack: number;
  credits: number;
  parity: ParityReport["summary"] | undefined;
}

export interface VoyageStats {
  behaviors: number;
  regrowths: number;
  rounds: number;
  /** Failed Kane results inside regrowth rounds, each returned to the agent as feedback. */
  failuresFedBack: number;
  kaneRuns: number;
  kaneSeconds: number;
  credits: number;
  baselinePassed: number;
  strength: { killed: number; total: number; score: number } | undefined;
  parity: { identical: number; diverged: number; failed: number; total: number };
  targets: TargetSummary[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeTarget(r: Regrowth): TargetSummary {
  const last = r.rounds.at(-1);
  const results = r.rounds.flatMap((round) => round.results);
  return {
    id: r.target.id,
    label: r.target.label,
    stack: r.target.stack,
    platform: r.target.platform,
    agent: r.agent,
    rounds: r.rounds.length,
    finalPassed: last ? last.results.filter((x) => x.outcome.status === "passed").length : 0,
    total: last ? last.results.length : 0,
    failuresFedBack: results.filter((x) => x.outcome.status !== "passed").length,
    credits: round1(results.reduce((s, x) => s + x.outcome.credits, 0)),
    parity: r.parity?.summary,
  };
}

export function voyageStats(voyage: Voyage): VoyageStats {
  const targets = voyage.regrowths.map(summarizeTarget);
  const regrowthResults = voyage.regrowths.flatMap((r) => r.rounds.flatMap((round) => round.results));
  const allResults = [...voyage.baseline, ...regrowthResults];
  const parity = targets.reduce(
    (acc, t) => {
      if (!t.parity) return acc;
      return {
        identical: acc.identical + t.parity.identical,
        diverged: acc.diverged + t.parity.diverged,
        failed: acc.failed + t.parity.failed,
        total: acc.total + t.parity.total,
      };
    },
    { identical: 0, diverged: 0, failed: 0, total: 0 },
  );
  return {
    behaviors: voyage.spec.behaviors.length,
    regrowths: voyage.regrowths.length,
    rounds: targets.reduce((s, t) => s + t.rounds, 0),
    failuresFedBack: targets.reduce((s, t) => s + t.failuresFedBack, 0),
    kaneRuns: allResults.length,
    kaneSeconds: allResults.reduce((s, x) => s + x.outcome.durationS, 0),
    credits: round1(allResults.reduce((s, x) => s + x.outcome.credits, 0)),
    baselinePassed: voyage.baseline.filter((x) => x.outcome.status === "passed").length,
    strength: voyage.strength ? { killed: voyage.strength.killed, total: voyage.strength.total, score: voyage.strength.score } : undefined,
    parity,
    targets,
  };
}

/** Share of behaviors whose stored values match the original exactly. */
export function parityScore(summary: ParityReport["summary"]): number {
  return summary.total === 0 ? 0 : summary.identical / summary.total;
}
