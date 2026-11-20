import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TheseusEvent } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { failed } from "../__tests__/fakes.js";
import { EventBus } from "./bus.js";
import { parseEventLines, readEvents, recordEvents } from "./recorder.js";
import { replayDelays, replayEvents } from "./replay.js";

const fixedClock = (start: string) => {
  let t = Date.parse(start);
  return { now: () => new Date((t += 250)) };
};

describe("recordEvents", () => {
  it("appends every event as one NDJSON line in emit order and reads them back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-events-"));
    const file = join(dir, "nested", "events.ndjson");
    const bus = new EventBus(fixedClock("2026-11-21T10:00:00.000Z"));
    const stop = recordEvents(bus, file);
    bus.emit({ type: "phase", phase: "regrow" });
    bus.emit({ type: "round-start", targetId: "nextjs", round: 1 });
    bus.log("warn", "careful");
    stop();
    bus.emit({ type: "phase", phase: "done" });

    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(3);
    const events = await readEvents(file);
    expect(events.map((event) => event.type)).toEqual(["phase", "round-start", "log"]);
    expect(events[0]?.at).toBe("2026-11-21T10:00:00.250Z");
  });

  it("strips evidence paths and home directories before writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-events-"));
    const file = join(dir, "events.ndjson");
    const bus = new EventBus();
    recordEvents(bus, file);
    bus.emit({
      type: "behavior-result",
      targetId: "nextjs",
      round: 1,
      result: {
        behaviorId: "add-item",
        targetId: "nextjs",
        outcome: failed({
          sessionDir: "/Users/someone/.testmuai/sessions/abc",
          reason: "screenshot at /Users/someone/work/shot.png",
          artifacts: { failShot: "artifacts/nextjs/round-1/add-item/fail.png", evidencePack: "/Users/someone/pack.zip", finalShot: "/Users/someone/final.png" },
        }),
      },
    });
    const text = await readFile(file, "utf8");
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("sessionDir");
    expect(text).not.toContain("evidencePack");
    expect(text).toContain("artifacts/nextjs/round-1/add-item/fail.png");
    expect(text).toContain("~/work/shot.png");
  });

  it("names the file and line of an invalid event", async () => {
    expect(() => parseEventLines('{"type":"phase","at":"2026-11-21T10:00:00.000Z","phase":"regrow"}\n{"type":"nope"}\n', "e.ndjson")).toThrow(
      /e.ndjson:2 is not a TheseusEvent/,
    );
    expect(() => parseEventLines("not json", "e.ndjson")).toThrow(/e.ndjson:1 is not valid JSON/);
    const dir = await mkdtemp(join(tmpdir(), "theseus-events-"));
    await writeFile(join(dir, "blank.ndjson"), "\n\n", "utf8");
    expect(await readEvents(join(dir, "blank.ndjson"))).toEqual([]);
  });
});

function at(ms: number): string {
  return new Date(Date.parse("2026-11-21T10:00:00.000Z") + ms).toISOString();
}

const events: TheseusEvent[] = [
  { type: "phase", at: at(0), phase: "regrow" },
  { type: "round-start", at: at(400), targetId: "nextjs", round: 1 },
  { type: "agent-output", at: at(600), targetId: "nextjs", round: 1, text: "write app/page.tsx" },
  { type: "round-end", at: at(600 + 5 * 60_000), targetId: "nextjs", round: 1, passed: 3, total: 4 },
  { type: "log", at: at(0), level: "info", message: "clock went backwards" },
];

describe("replayDelays", () => {
  it("keeps short gaps, caps long ones and never goes negative", () => {
    expect(replayDelays(events, { speed: 1, maxGapMs: 1200 })).toEqual([0, 400, 200, 1200, 0]);
  });

  it("divides by the speed multiplier", () => {
    expect(replayDelays(events, { speed: 4, maxGapMs: 1200 })).toEqual([0, 100, 50, 300, 0]);
  });

  it("rejects a non-positive speed", () => {
    expect(() => replayDelays(events, { speed: 0, maxGapMs: 1200 })).toThrow(RangeError);
  });
});

describe("replayEvents", () => {
  it("sleeps before each event and delivers them in order", async () => {
    const slept: number[] = [];
    const seen: string[] = [];
    await replayEvents(events, (event) => seen.push(event.type), {
      timing: { speed: 2, maxGapMs: 1000 },
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(slept).toEqual([0, 200, 100, 500, 0]);
    expect(seen).toEqual(["phase", "round-start", "agent-output", "round-end", "log"]);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    await expect(
      replayEvents(
        events,
        (event) => {
          seen.push(event.type);
          if (seen.length === 2) controller.abort();
        },
        { sleep: async () => {}, signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/);
    expect(seen).toHaveLength(2);
  });
});
