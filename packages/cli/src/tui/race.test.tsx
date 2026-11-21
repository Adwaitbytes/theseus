import type { KaneOutcome, Regrowth, Voyage } from "@theseus/schema";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import { raceTables, seedFromVoyage } from "./state.js";
import { ViewStore } from "./store.js";

const AT = "2026-11-21T10:00:00.000Z";
const pass: KaneOutcome = { status: "passed", exitCode: 0, oneLiner: "", reason: "", durationS: 60, credits: 21, finalState: {}, steps: [], artifacts: {} };
const fail: KaneOutcome = { ...pass, status: "failed", exitCode: 1 };

function regrowth(id: string, agent: "codex" | "claude-code", rounds: KaneOutcome[], credits: number): Regrowth {
  return {
    id,
    target: { id, label: id, platform: "web", stack: "Next.js (App Router, TypeScript)", original: false },
    agent: { name: agent, model: "default", version: "1" },
    startedAt: AT,
    endedAt: AT,
    rounds: rounds.map((outcome, index) => ({
      n: index + 1,
      startedAt: AT,
      endedAt: AT,
      diffStat: { files: 1, additions: 1, deletions: 0 },
      results: [{ behaviorId: "add", targetId: id, outcome }],
    })),
    creditsUsed: credits,
  };
}

const voyage: Voyage = {
  version: 1,
  id: "todo",
  title: "Todo race",
  spec: {
    version: 1,
    app: { name: "Todo", description: "x", origin: { id: "original", label: "Original", platform: "web", stack: "jQuery", url: "http://localhost:4170", original: true } },
    capturedAt: AT,
    behaviors: [{ id: "add", title: "Add", area: "Todos", objective: "Add a todo and verify it shows in the list.", stores: [], tags: [], source: "capture" }],
  },
  baseline: [{ behaviorId: "add", targetId: "original", outcome: pass }],
  regrowths: [regrowth("nextjs-codex", "codex", [fail, pass], 63), regrowth("nextjs-claude", "claude-code", [pass], 21)],
};

describe("race summary", () => {
  it("derives one row per agent from the regrowths", () => {
    const [table] = raceTables(voyage);
    expect(table?.title).toBe("Next.js (App Router, TypeScript) on web");
    expect(table?.rows).toEqual([
      { targetId: "nextjs-codex", agent: "Codex", toGreen: "round 2", passed: "1/1", parity: "pending", credits: "63", winner: false },
      { targetId: "nextjs-claude", agent: "Claude Code", toGreen: "round 1", passed: "1/1", parity: "pending", credits: "21", winner: true },
    ]);
    expect(raceTables(undefined)).toEqual([]);
    expect(raceTables({ ...voyage, regrowths: voyage.regrowths.slice(0, 1) })).toEqual([]);
  });

  it("appears under the parity certificate at the end of a voyage", async () => {
    const store = new ViewStore(seedFromVoyage(voyage, 5));
    const { lastFrame, unmount } = render(<App store={store} color={false} />);
    store.finish({ voyage });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Agent race");
    expect(frame).toMatch(/Claude Code\s+nextjs-claude\s+round 1\s+1\/1\s+pending\s+21\s+winner/);
    unmount();
  });
});
