import { describe, expect, it } from "vitest";
import { behavior, failed, outcome, regrowth, voyageOf } from "./__tests__/fakes.js";
import { computeParity } from "./parity.js";
import { raceSummary, roundsToGreen } from "./race.js";

const behaviors = [behavior("add-todo"), behavior("edit-todo")];
const pass = outcome();
const fail = failed();

describe("roundsToGreen", () => {
  it("is the first round after which every behavior's latest result passed", () => {
    const slow = regrowth("nextjs-codex", "codex", [{ "add-todo": pass, "edit-todo": fail }, { "edit-todo": pass }]);
    expect(roundsToGreen(behaviors, slow)).toBe(2);
    const never = regrowth("nextjs-claude", "claude-code", [{ "add-todo": pass, "edit-todo": fail }]);
    expect(roundsToGreen(behaviors, never)).toBeUndefined();
    const regressed = regrowth("x", "codex", [{ "add-todo": pass, "edit-todo": pass }, { "add-todo": fail }]);
    expect(roundsToGreen(behaviors, regressed)).toBe(1);
  });
});

describe("raceSummary", () => {
  it("pairs targets that share a stack but not an agent, and names the faster green one", () => {
    const codex = regrowth("nextjs-codex", "codex", [{ "add-todo": pass, "edit-todo": fail }, { "edit-todo": pass }], { credits: 80 });
    const claude = regrowth("nextjs-claude", "claude-code", [{ "add-todo": pass, "edit-todo": pass }], { credits: 40 });
    const solo = regrowth("sveltekit", "codex", [{ "add-todo": pass, "edit-todo": pass }], { stack: "SvelteKit" });
    const voyage = voyageOf(behaviors, [codex, claude, solo], { "add-todo": pass, "edit-todo": pass });
    const withParity = {
      ...voyage,
      regrowths: voyage.regrowths.map((r) => ({
        ...r,
        parity: computeParity(voyage.spec, voyage.baseline, r.rounds.flatMap((round) => round.results), r.id),
      })),
    };
    const races = raceSummary(withParity);
    expect(races).toHaveLength(1);
    const [race] = races;
    expect(race?.stack).toBe("Next.js");
    expect(race?.winner).toBe("nextjs-claude");
    expect(race?.entries).toEqual([
      { targetId: "nextjs-codex", label: "nextjs-codex", agent: "codex", model: "default", roundsToGreen: 2, rounds: 2, passed: 2, total: 2, parityIdentical: 2, credits: 80 },
      { targetId: "nextjs-claude", label: "nextjs-claude", agent: "claude-code", model: "default", roundsToGreen: 1, rounds: 1, passed: 2, total: 2, parityIdentical: 2, credits: 40 },
    ]);
  });

  it("calls no winner on a tie or when nobody went green, and ignores same-agent pairs", () => {
    const a = regrowth("a", "codex", [{ "add-todo": pass, "edit-todo": pass }], { credits: 10 });
    const b = regrowth("b", "claude-code", [{ "add-todo": pass, "edit-todo": pass }], { credits: 10 });
    expect(raceSummary(voyageOf(behaviors, [a, b]))[0]?.winner).toBeUndefined();
    const c = regrowth("c", "codex", [{ "add-todo": fail }]);
    const d = regrowth("d", "claude-code", [{ "add-todo": fail }]);
    expect(raceSummary(voyageOf(behaviors, [c, d]))[0]?.winner).toBeUndefined();
    const e = regrowth("e", "codex", [{ "add-todo": pass }]);
    expect(raceSummary(voyageOf(behaviors, [c, e]))).toEqual([]);
  });

  it("keeps a race on a different platform apart from the same stack on web", () => {
    const android = regrowth("expo-android-codex", "codex", [{}], { stack: "Expo", platform: "android" });
    const ios = regrowth("expo-ios-claude", "claude-code", [{}], { stack: "Expo", platform: "ios" });
    expect(raceSummary(voyageOf(behaviors, [android, ios]))).toEqual([]);
  });
});
