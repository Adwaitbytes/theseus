import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TheseusEvent, Voyage } from "@theseus/schema";
import { buildReplay, roundMarks, shortLabel, snapshotAt } from "./replay";
import { formatDuration } from "./format";
import { voyageStats } from "./stats";

const dir = fileURLToPath(new URL("../fixtures/todomvc-jquery.fixture/", import.meta.url));
const voyage = Voyage.parse(JSON.parse(readFileSync(`${dir}voyage.json`, "utf8")));
const events = readFileSync(`${dir}events.ndjson`, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => TheseusEvent.parse(JSON.parse(line)));

describe("buildReplay", () => {
  const data = buildReplay(voyage, events);

  it("puts the original first and one column per regrowth", () => {
    expect(data.columns[0]?.original).toBe(true);
    expect(data.columns.map((c) => c.id)).toEqual(["original", ...voyage.regrowths.map((r) => r.target.id)]);
  });

  it("starts with every cell pending", () => {
    const s = snapshotAt(data, 0);
    expect(s.cells.flat().every((c) => c.state === "pending")).toBe(true);
    expect(s.proven).toBe(0);
    expect(s.at).toBeUndefined();
  });

  it("ends in the same state as the last round of every regrowth", () => {
    const s = snapshotAt(data, data.frames.length);
    voyage.regrowths.forEach((r, i) => {
      const last = r.rounds.at(-1)!;
      for (const result of last.results) {
        const row = data.rows.findIndex((x) => x.id === result.behaviorId);
        expect(s.cells[row]![i + 1]!.state).toBe(result.outcome.status === "passed" ? "passed" : "failed");
      }
    });
  });

  it("agrees with the voyage totals", () => {
    const s = snapshotAt(data, data.frames.length);
    const stats = voyageStats(voyage);
    expect(s.rounds).toBe(stats.rounds);
    expect(s.bugsCaught).toBe(stats.failuresFedBack);
    expect(s.credits).toBeCloseTo(stats.credits, 1);
  });

  it("marks a cell running between start and result", () => {
    const firstStart = data.frames.findIndex((f) => f.state === "running");
    const s = snapshotAt(data, firstStart + 1);
    const f = data.frames[firstStart]!;
    expect(s.cells[f.row]![f.col]!.state).toBe("running");
  });

  it("clamps out-of-range indices", () => {
    expect(snapshotAt(data, -5).credits).toBe(0);
    expect(snapshotAt(data, 1e9).proven).toBe(snapshotAt(data, data.frames.length).proven);
  });

  it("rebuilds the same final state from the voyage when no events were recorded", () => {
    const fromVoyage = buildReplay(voyage, []);
    const a = snapshotAt(fromVoyage, fromVoyage.frames.length);
    const b = snapshotAt(data, data.frames.length);
    expect(a.cells.map((r) => r.map((c) => c.state))).toEqual(b.cells.map((r) => r.map((c) => c.state)));
    expect(a.rounds).toBe(b.rounds);
  });

  it("lists every diverged parity row as a cell key", () => {
    const expected = voyage.regrowths.reduce((s, r) => s + (r.parity?.summary.diverged ?? 0), 0);
    expect(data.diverged).toHaveLength(expected);
    for (const key of data.diverged) expect(key).toMatch(/^\d+:[1-9]\d*$/);
  });

  it("emits one round mark per column round", () => {
    const marks = roundMarks(data);
    const expected = 1 + voyage.regrowths.reduce((s, r) => s + r.rounds.length, 0);
    expect(marks).toHaveLength(expected);
  });
});

describe("shortLabel", () => {
  it("shortens column labels for narrow screens", () => {
    expect(shortLabel("jQuery (2012)")).toBe("jQuery");
    expect(shortLabel("Next.js")).toBe("Next");
    expect(shortLabel("SvelteKit")).toBe("Svelte");
    expect(shortLabel("iOS")).toBe("iOS");
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(725)).toBe("12 m 05 s");
    expect(formatDuration(4512)).toBe("1 h 15 m");
  });
});

describe("finalAttemptEvents", () => {
  it("drops aborted regrowth attempts and superseded baseline results", async () => {
    const { finalAttemptEvents } = await import("./replay");
    const at = "2026-11-21T00:00:00.000Z";
    const outcome = (status: "passed" | "failed") => ({ status, exitCode: status === "passed" ? 0 : 1, oneLiner: "", reason: "", durationS: 1, credits: 1, finalState: {}, steps: [], artifacts: {} });
    const result = (targetId: string, round: number, status: "passed" | "failed") =>
      ({ type: "behavior-result", at, targetId, round, result: { behaviorId: "add", targetId, outcome: outcome(status) } }) as const;
    const voyage = { spec: { app: { origin: { id: "original" } } } } as unknown as Parameters<typeof finalAttemptEvents>[0];
    const events = [
      result("original", 0, "failed"),
      result("original", 0, "passed"),
      { type: "round-start", at, targetId: "nextjs", round: 1 } as const,
      result("nextjs", 1, "failed"),
      { type: "round-start", at, targetId: "nextjs", round: 1 } as const,
      result("nextjs", 1, "passed"),
    ];
    const kept = finalAttemptEvents(voyage, events).filter((e) => e.type === "behavior-result");
    expect(kept.map((e) => (e.type === "behavior-result" ? `${e.targetId}:${e.result.outcome.status}` : ""))).toEqual(["original:passed", "nextjs:passed"]);
  });
});
