import type { Behavior, Mutant, ParityValue, ParityVerdict, Regrowth, Voyage } from "@theseus/schema";

/** Real artifacts from a voyage, picked to illustrate each step on the home page. */
export interface Highlights {
  specimen: Behavior;
  specimenVerdicts: { label: string; verdict: ParityVerdict | "original" }[];
  mutant: Mutant | undefined;
  feedback: { target: Regrowth["target"]; round: number; text: string } | undefined;
  parity: { target: Regrowth["target"]; behavior: Behavior; value: ParityValue; verdict: ParityVerdict } | undefined;
}

export function pickHighlights(voyage: Voyage): Highlights {
  const behaviors = voyage.spec.behaviors;
  const byId = new Map(behaviors.map((b) => [b.id, b]));

  // The parity example: a value that diverged says more than one that matched.
  const candidates = voyage.regrowths.flatMap((r) =>
    (r.parity?.rows ?? []).flatMap((row) => {
      const behavior = byId.get(row.behaviorId);
      return behavior ? row.values.map((value) => ({ target: r.target, behavior, value, verdict: row.verdict })) : [];
    }),
  );
  const parity = candidates.find((c) => !c.value.equal && c.value.candidate !== null) ?? candidates[0];

  // The specimen behavior: the one whose verdicts differ most across targets.
  const verdictsFor = (id: string) => [
    { label: voyage.spec.app.origin.label, verdict: "original" as const },
    ...voyage.regrowths.map((r) => ({
      label: r.target.label,
      verdict: r.parity?.rows.find((row) => row.behaviorId === id)?.verdict ?? ("failed-candidate" as ParityVerdict),
    })),
  ];
  const specimen =
    behaviors.find((b) => voyage.regrowths.some((r) => r.parity?.rows.some((row) => row.behaviorId === b.id && row.verdict !== "identical"))) ??
    behaviors[0]!;

  const mutant = voyage.strength?.mutants.find((m) => m.killedBy.length === 0) ?? voyage.strength?.mutants[0];

  let feedback: Highlights["feedback"];
  outer: for (const r of voyage.regrowths) {
    for (const round of r.rounds) {
      if (!round.feedback) continue;
      const [summary, firstBlock] = round.feedback.split("\n\n");
      feedback = { target: r.target, round: round.n, text: [summary, firstBlock].filter(Boolean).join("\n\n") };
      break outer;
    }
  }

  return { specimen, specimenVerdicts: verdictsFor(specimen.id), mutant, feedback, parity };
}
