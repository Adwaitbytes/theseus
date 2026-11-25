import type { TheseusEvent, Voyage } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { certifiedAttempt } from "./certified.js";

const at = "2026-11-21T00:00:00.000Z";
const outcome = (status: "passed" | "failed") => ({
  status, exitCode: status === "passed" ? 0 : 1, oneLiner: "", reason: "", durationS: 1, credits: 1, finalState: {}, steps: [], artifacts: {},
});
const result = (targetId: string, round: number, status: "passed" | "failed"): TheseusEvent =>
  ({ type: "behavior-result", at, targetId, round, result: { behaviorId: "add", targetId, outcome: outcome(status) } }) as TheseusEvent;
const voyage = {
  spec: { app: { origin: { id: "original" } } },
  regrowths: [{ target: { id: "nextjs" } }],
} as unknown as Voyage;

describe("certifiedAttempt", () => {
  it("keeps the last attempt per target, the latest baseline result, and drops uncertified targets", () => {
    const events: TheseusEvent[] = [
      result("original", 0, "failed"),
      result("original", 0, "passed"),
      { type: "round-start", at, targetId: "nextjs", round: 1 },
      result("nextjs", 1, "failed"),
      { type: "log", at, level: "warn", message: "nextjs round 1: build failed" },
      { type: "round-start", at, targetId: "nextjs", round: 1 },
      result("nextjs", 1, "passed"),
      { type: "round-start", at, targetId: "expo-ios", round: 1 },
      { type: "log", at, level: "warn", message: "expo-ios round 1: build failed" },
      { type: "phase", at, phase: "done" },
    ];
    const kept = certifiedAttempt(voyage, events);
    const results = kept.flatMap((e) => (e.type === "behavior-result" ? [`${e.targetId}:${e.result.outcome.status}`] : []));
    expect(results).toEqual(["original:passed", "nextjs:passed"]);
    expect(kept.some((e) => e.type === "log")).toBe(false);
    expect(kept.some((e) => "targetId" in e && e.targetId === "expo-ios")).toBe(false);
    expect(kept.at(-1)?.type).toBe("phase");
  });
});
