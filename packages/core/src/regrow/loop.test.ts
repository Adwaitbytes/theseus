import type { Behavior, BehaviorResult, Regrowth, Spec, Target } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { FakeAgent, FakeKaneClient, behavior, failed, fakeAgentInfo, outcome } from "../__tests__/fakes.js";
import type { TargetConfig } from "../config.js";
import { TheseusError } from "../errors.js";
import { EventBus } from "../events/bus.js";
import { CreditLedger } from "../kane/budget.js";
import { runRegrowLoop, type PreparedApp, type RegrowLoopDeps } from "./loop.js";

const behaviors: Behavior[] = [behavior("add-item"), behavior("edit-item"), behavior("clear-completed"), behavior("persist-reload")];
/** The build number from which each behavior starts passing; the fake agent bumps the build once per call. */
const fixedIn: Record<string, number> = { "add-item": 1, "edit-item": 1, "clear-completed": 2, "persist-reload": 3 };

const spec: Spec = {
  version: 1,
  app: { name: "Todo", description: "todos", origin: { id: "original", label: "Original", platform: "web", stack: "jquery", original: true } },
  capturedAt: "2026-11-21T00:00:00.000Z",
  behaviors,
};
const targetConfig: TargetConfig = { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", agent: "claude-code" };
const target: Target = { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", original: false };

interface Harness {
  deps: RegrowLoopDeps;
  agent: FakeAgent;
  kane: FakeKaneClient;
  bus: EventBus;
  commits: string[];
  persisted: Regrowth[];
  build: () => number;
}

function harness(options: { budget?: number; failBuild?: (build: number) => boolean; regressAt?: { build: number; behaviorId: string } } = {}): Harness {
  let build = 0;
  let clock = Date.parse("2026-11-21T10:00:00.000Z");
  const agent = new FakeAgent(async () => {
    build += 1;
  });
  const kane = new FakeKaneClient((b, t) => {
    const runningBuild = Number(/build-(\d+)/.exec(t.url ?? "")?.[1]);
    if (options.regressAt?.behaviorId === b.id && options.regressAt.build === runningBuild) return failed();
    return runningBuild >= (fixedIn[b.id] ?? 99) ? outcome({ finalState: { [b.stores[0] ?? "x"]: "1" } }) : failed();
  });
  const bus = new EventBus({ now: () => new Date((clock += 1000)) });
  const commits: string[] = [];
  const persisted: Regrowth[] = [];
  const ledger = new CreditLedger({ perRunEstimate: 20, ...(options.budget === undefined ? {} : { budget: options.budget }) });
  const deps: RegrowLoopDeps = {
    agent,
    bus,
    ledger,
    clock: { now: () => new Date((clock += 1000)) },
    prepareApp: async (): Promise<PreparedApp> =>
      options.failBuild?.(build) === true
        ? { ok: false, error: "npm run build exited with 1\nType error in app/page.tsx" }
        : { ok: true, target: { ...target, url: `http://127.0.0.1:3000/build-${build}` }, stop: async () => {} },
    runBehaviors: async (list, runTarget, round) => {
      const results: BehaviorResult[] = [];
      for (const b of list) {
        const o = await kane.runBehavior(b, runTarget, { cwd: "/tmp", artifactsDir: "/tmp", artifactsRoot: "/tmp" });
        ledger.add(o.credits);
        const result = { behaviorId: b.id, targetId: runTarget.id, outcome: o };
        bus.emit({ type: "behavior-result", targetId: runTarget.id, round, result });
        results.push(result);
      }
      return results;
    },
    commit: async (message) => {
      commits.push(message);
      return { commit: `c${commits.length}`, diffStat: { files: 1, additions: 10, deletions: 0 } };
    },
    stageFailShot: async () => undefined,
    persist: async (regrowth) => {
      persisted.push(regrowth);
    },
  };
  return { deps, agent, kane, bus, commits, persisted, build: () => build };
}

const input = { spec, targetConfig, target, agentInfo: fakeAgentInfo, workspace: "/tmp/ws", maxRounds: 5 };

describe("runRegrowLoop", () => {
  it("reruns only failures each round, then makes one full regression pass", async () => {
    const h = harness();
    const regrowth = await runRegrowLoop(input, h.deps);

    expect(h.agent.prompts).toHaveLength(3);
    expect(h.agent.prompts[0]).toContain("Build the app described in SPEC.md");
    expect(h.agent.prompts[1]).toContain("Round 2.");
    expect(h.agent.prompts[1]).toContain("clear-completed");
    expect(h.agent.prompts[1]).not.toContain("`add-item`");

    expect(regrowth.rounds.map((round) => round.results.map((r) => r.behaviorId))).toEqual([
      ["add-item", "edit-item", "clear-completed", "persist-reload"],
      ["clear-completed", "persist-reload"],
      ["persist-reload"],
      ["add-item", "edit-item", "clear-completed", "persist-reload"],
    ]);
    expect(h.commits).toEqual([
      "round 1: 2/4 behaviors proven (kane)",
      "round 2: 3/4 behaviors proven (kane)",
      "round 3: 4/4 behaviors proven (kane)",
      "round 4: 4/4 behaviors proven (kane)",
    ]);
    expect(regrowth.rounds[3]?.feedback).toBeUndefined();
    expect(regrowth.rounds[1]?.feedback).toContain("Round 2.");
    expect(h.kane.calls).toHaveLength(11);
    expect(regrowth.creditsUsed).toBe(220);
    expect(regrowth.rounds.map((round) => round.commit)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(h.persisted).toHaveLength(5);
  });

  it("goes back to the builder when the regression pass finds a regression", async () => {
    const h = harness({ regressAt: { build: 3, behaviorId: "add-item" } });
    const regrowth = await runRegrowLoop(input, h.deps);
    // build 1: add+edit pass; build 2: clear passes; build 3: persist passes; regression on build 3 fails add-item;
    // build 4 fixes it; a second regression pass confirms.
    expect(h.agent.prompts).toHaveLength(4);
    expect(h.agent.prompts[3]).toContain("add-item");
    expect(regrowth.rounds.map((round) => round.results.length)).toEqual([4, 2, 1, 4, 1, 4]);
    expect(regrowth.rounds.at(-1)?.results.every((r) => r.outcome.status === "passed")).toBe(true);
  });

  it("stops at maxRounds builds when behaviors keep failing", async () => {
    const h = harness();
    const regrowth = await runRegrowLoop({ ...input, maxRounds: 2 }, h.deps);
    expect(h.agent.prompts).toHaveLength(2);
    expect(regrowth.rounds).toHaveLength(2);
    expect(h.commits.at(-1)).toBe("round 2: 3/4 behaviors proven (kane)");
  });

  it("turns a failed build into not-run results and feeds the build error back", async () => {
    const h = harness({ failBuild: (build) => build === 1 });
    const regrowth = await runRegrowLoop(input, h.deps);
    expect(regrowth.rounds[0]?.results.every((r) => r.outcome.status === "failed" && r.outcome.credits === 0)).toBe(true);
    expect(h.agent.prompts[1]).toContain("The app did not build or start");
    expect(h.agent.prompts[1]).toContain("Type error in app/page.tsx");
    expect(h.kane.calls.filter((call) => call.target.url?.endsWith("build-1"))).toHaveLength(0);
  });

  it("refuses a round the credit budget cannot cover", async () => {
    const h = harness({ budget: 100 });
    await expect(runRegrowLoop(input, h.deps)).rejects.toThrow(TheseusError);
    expect(h.kane.calls).toHaveLength(4);
    expect(h.agent.prompts).toHaveLength(1);
  });

  it("resumes an interrupted regrowth at the next round", async () => {
    const first = harness();
    const full = await runRegrowLoop({ ...input, maxRounds: 2 }, first.deps);
    const resumed = harness();
    // The resumed agent's build counter restarts, so start it where the first one stopped.
    await resumed.deps.agent.run({ cwd: "/tmp", prompt: "warm", onOutput: () => {} });
    await resumed.deps.agent.run({ cwd: "/tmp", prompt: "warm", onOutput: () => {} });
    const regrowth = await runRegrowLoop({ ...input, existing: full }, resumed.deps);
    expect(regrowth.rounds.map((round) => round.n)).toEqual([1, 2, 3, 4]);
    expect(regrowth.startedAt).toBe(full.startedAt);
    expect(resumed.commits).toEqual(["round 3: 4/4 behaviors proven (kane)", "round 4: 4/4 behaviors proven (kane)"]);
  });

  it("emits round and agent events for the TUI", async () => {
    const h = harness();
    const types: string[] = [];
    h.bus.on((event) => types.push(event.type));
    await runRegrowLoop(input, h.deps);
    expect(types.filter((t) => t === "round-start")).toHaveLength(4);
    expect(types.filter((t) => t === "round-end")).toHaveLength(4);
    expect(types).toContain("agent-output");
  });
});

describe("doubted failures", () => {
  it("reruns a failure Kane blames on the test before it can reach the builder", async () => {
    const h = harness();
    let calls = 0;
    const flaky = failed();
    const doubted = { ...flaky, rca: { rootCause: "[automation_bug] the run skipped a store step", suggestedFix: "store it" } };
    h.deps = {
      ...h.deps,
      runBehaviors: async (list, runTarget) =>
        list.map((b) => {
          calls += 1;
          const firstAttempt = b.id === "add-item" && calls === 1;
          return { behaviorId: b.id, targetId: runTarget.id, outcome: firstAttempt ? doubted : outcome({ finalState: { [b.stores[0] ?? "x"]: "1" } }) };
        }),
    };
    const regrowth = await runRegrowLoop({ ...input, maxRounds: 1 }, h.deps);
    const round = regrowth.rounds[0];
    expect(round?.results.find((r) => r.behaviorId === "add-item")?.outcome.status).toBe("passed");
  });
});
