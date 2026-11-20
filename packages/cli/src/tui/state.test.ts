import type { KaneOutcome, TheseusEvent, Voyage } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { initialState, reduce, seedFromVoyage, summaryRows, type ViewState } from "./state.js";
import { pad, truncate, colorEnabled, formatElapsed, paint } from "./theme.js";

const at = (s: number): string => new Date(Date.parse("2026-11-21T10:00:00.000Z") + s * 1000).toISOString();

function outcome(status: KaneOutcome["status"], credits = 20): KaneOutcome {
  return { status, exitCode: status === "passed" ? 0 : 1, oneLiner: "", reason: "", durationS: 60, credits, finalState: {}, steps: [], artifacts: {} };
}

function play(state: ViewState, events: TheseusEvent[]): ViewState {
  return events.reduce(reduce, state);
}

const seed = {
  title: "TodoMVC",
  maxRounds: 5,
  behaviors: ["add", "edit"],
  lanes: [
    { id: "original", label: "Original", stack: "jQuery", isOriginal: true },
    { id: "nextjs", label: "Next.js", stack: "Next.js", isOriginal: false },
  ],
};

describe("reduce", () => {
  it("tracks phases, rounds, cells, credits, remarks and the agent tail", () => {
    const state = play(initialState(seed), [
      { type: "phase", at: at(0), phase: "regrow", detail: "nextjs" },
      { type: "round-start", at: at(1), targetId: "nextjs", round: 1 },
      { type: "agent-output", at: at(2), targetId: "nextjs", round: 1, text: "one" },
      { type: "agent-output", at: at(3), targetId: "nextjs", round: 1, text: "two" },
      { type: "agent-output", at: at(4), targetId: "nextjs", round: 1, text: "three" },
      { type: "agent-output", at: at(5), targetId: "nextjs", round: 1, text: "four" },
      { type: "behavior-start", at: at(6), targetId: "nextjs", behaviorId: "add", round: 1 },
      { type: "kane-step", at: at(7), targetId: "nextjs", behaviorId: "add", step: 2, status: "running", remark: "typing" },
    ]);
    const lane = state.lanes[1];
    expect(state.phase).toBe("regrow");
    expect(state.lanes[0]?.activity).toBe("done");
    expect(lane?.round).toBe(1);
    expect(lane?.activity).toBe("verifying");
    expect(lane?.agentTail).toEqual(["two", "three", "four"]);
    expect(lane?.cells.get("add")).toBe("running");
    expect(lane?.cells.get("edit")).toBe("pending");
    expect(lane?.remark).toBe("add  2  typing");

    const after = play(state, [
      { type: "behavior-result", at: at(70), targetId: "nextjs", round: 1, result: { behaviorId: "add", targetId: "nextjs", outcome: outcome("passed", 20.5) } },
      { type: "behavior-result", at: at(80), targetId: "nextjs", round: 1, result: { behaviorId: "edit", targetId: "nextjs", outcome: outcome("error", 0) } },
      { type: "round-end", at: at(81), targetId: "nextjs", round: 1, passed: 1, total: 2 },
    ]);
    expect(after.lanes[1]?.cells.get("add")).toBe("pass");
    expect(after.lanes[1]?.cells.get("edit")).toBe("error");
    expect(after.lanes[1]?.passed).toBe(1);
    expect(after.credits).toBe(20.5);
    expect(after.lastAt! - after.startedAt!).toBe(81_000);
    expect(after).not.toBe(state);
  });

  it("adds lanes and behaviors it was not seeded with", () => {
    const state = play(initialState({ title: "x" }), [
      { type: "behavior-start", at: at(0), targetId: "sveltekit", behaviorId: "new-one", round: 1 },
      { type: "log", at: at(1), level: "warn", message: "a" },
      { type: "log", at: at(2), level: "info", message: "b" },
      { type: "log", at: at(3), level: "info", message: "c" },
      { type: "log", at: at(4), level: "error", message: "d" },
    ]);
    expect(state.lanes.map((lane) => lane.id)).toEqual(["sveltekit"]);
    expect(state.behaviors).toEqual(["new-one"]);
    expect(state.logs.map((log) => log.message)).toEqual(["b", "c", "d"]);
  });

  it("marks everything done at the end", () => {
    const state = play(initialState(seed), [{ type: "phase", at: at(0), phase: "done" }]);
    expect(state.done).toBe(true);
    expect(state.lanes.every((lane) => lane.activity === "done")).toBe(true);
  });
});

describe("summaryRows", () => {
  const voyage: Voyage = {
    version: 1,
    id: "todo",
    title: "TodoMVC",
    spec: {
      version: 1,
      app: { name: "T", description: "d", origin: { id: "original", label: "Original", platform: "web", stack: "jQuery", original: true } },
      capturedAt: at(0),
      behaviors: [{ id: "add", title: "Add", area: "A", objective: "Add an item and verify it shows in the list.", stores: [], tags: [], source: "capture" }],
    },
    baseline: [],
    regrowths: [
      {
        id: "nextjs",
        target: { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", original: false },
        agent: { name: "claude-code", model: "m", version: "1" },
        startedAt: at(0),
        endedAt: at(1),
        rounds: [
          { n: 1, startedAt: at(0), endedAt: at(1), diffStat: { files: 1, additions: 1, deletions: 0 }, results: [] },
          { n: 2, startedAt: at(0), endedAt: at(1), diffStat: { files: 1, additions: 1, deletions: 0 }, results: [] },
        ],
        parity: { originalTargetId: "original", candidateTargetId: "nextjs", rows: [], summary: { identical: 17, diverged: 1, failed: 0, total: 18 } },
        creditsUsed: 512,
      },
    ],
  };

  it("uses parity from the voyage and falls back to the grid", () => {
    const state = initialState(seedFromVoyage(voyage));
    const rows = summaryRows(state, voyage);
    expect(rows[0]).toMatchObject({ label: "Original", rounds: "baseline", parity: "reference", verdict: "original" });
    expect(rows[1]).toMatchObject({ label: "Next.js", rounds: "2", parity: "17/18 identical", credits: "512", verdict: "partial" });
    expect(summaryRows(state, undefined)[1]).toMatchObject({ parity: "pending", verdict: "failed" });
  });
});

describe("theme helpers", () => {
  it("honours NO_COLOR", () => {
    expect(colorEnabled({})).toBe(true);
    expect(colorEnabled({ NO_COLOR: "1" })).toBe(false);
    expect(colorEnabled({ NO_COLOR: "" })).toBe(true);
    expect(paint("pass", false)).toEqual({});
    expect(paint("pass", true)).toEqual({ color: "#4ADE80" });
    expect(paint("muted", true)).toEqual({ dimColor: true });
  });

  it("pads with a gutter and truncates with an ellipsis", () => {
    expect(pad("Original", 10)).toBe("Original  ");
    expect(pad("jQuery TodoMVC", 14)).toBe("jQuery Tod... ");
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("abc", 0)).toBe("");
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });
});
