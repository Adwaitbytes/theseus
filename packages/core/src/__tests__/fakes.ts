import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, Behavior, KaneOutcome, Regrowth, Target, Voyage } from "@theseus/schema";
import type { AgentRunInput, BuilderAgent } from "../agents/types.js";
import type { KaneClient, RunBehaviorOptions, RunSuiteOptions, SuiteResult } from "../ports.js";

export function outcome(overrides: Partial<KaneOutcome> = {}): KaneOutcome {
  return {
    status: "passed",
    exitCode: 0,
    oneLiner: "ok",
    reason: "all checks passed",
    durationS: 60,
    credits: 20,
    finalState: {},
    steps: [{ index: 1, status: "done", remark: "opened the app" }],
    artifacts: {},
    ...overrides,
  };
}

export function failed(overrides: Partial<KaneOutcome> = {}): KaneOutcome {
  return outcome({
    status: "failed",
    exitCode: 1,
    oneLiner: "counter mismatch",
    reason: "expected 2 items left, saw 3",
    failingStep: { index: 3, remark: "verify the counter shows 2 items left" },
    ...overrides,
  });
}

export function behavior(id: string, overrides: Partial<Behavior> = {}): Behavior {
  return {
    id,
    title: `Behavior ${id}`,
    area: "Core",
    objective: `Starting from a fresh app, add an item, store the count as '${id.replace(/-/g, "_")}', and verify it shows.`,
    stores: [id.replace(/-/g, "_")],
    tags: [],
    source: "capture",
    ...overrides,
  };
}

export type KaneDecider = (behavior: Behavior, target: Target) => KaneOutcome;

/** A KaneClient that answers from a function and records every call. */
export class FakeKaneClient implements KaneClient {
  readonly calls: { behaviorId: string; target: Target; options: RunBehaviorOptions }[] = [];
  readonly exports: { behaviors: readonly Behavior[]; target: Target; outDir: string }[] = [];
  readonly suites: RunSuiteOptions[] = [];
  decide: KaneDecider;

  constructor(decide: KaneDecider = () => outcome()) {
    this.decide = decide;
  }

  version(): Promise<string> {
    return Promise.resolve("kane-cli 0.0.0-fake");
  }

  balance(): Promise<number> {
    return Promise.resolve(10_000);
  }

  async runBehavior(b: Behavior, target: Target, options: RunBehaviorOptions): Promise<KaneOutcome> {
    this.calls.push({ behaviorId: b.id, target, options });
    options.onStep?.({ step: 1, status: "running", remark: "opening the app" });
    options.onStep?.({ step: 1, status: "done", remark: "opened the app" });
    await Promise.resolve();
    return this.decide(b, target);
  }

  exportTestMd(behaviors: readonly Behavior[], target: Target, outDir: string): Promise<string[]> {
    this.exports.push({ behaviors, target, outDir });
    return Promise.resolve(behaviors.map((b) => join(outDir, `${b.id}_test.md`)));
  }

  runSuite(options: RunSuiteOptions): Promise<SuiteResult> {
    this.suites.push(options);
    return Promise.resolve({ status: "passed", exitCode: 0, planValid: true, planned: [], refused: [], members: [], durationS: 0 });
  }
}

export const fakeAgentInfo: AgentInfo = { name: "claude-code", model: "fake", version: "0.0.0" };

/** A builder agent that runs a callback instead of a model; the callback sees the round number. */
export class FakeAgent implements BuilderAgent {
  readonly prompts: string[] = [];
  readonly #act: (input: AgentRunInput, call: number) => Promise<void>;

  constructor(act: (input: AgentRunInput, call: number) => Promise<void> = async () => {}) {
    this.#act = act;
  }

  info(): Promise<AgentInfo> {
    return Promise.resolve(fakeAgentInfo);
  }

  async run(input: AgentRunInput): Promise<{ exitCode: number }> {
    this.prompts.push(input.prompt);
    input.onOutput(`fake agent call ${this.prompts.length}`);
    await this.#act(input, this.prompts.length);
    return { exitCode: 0 };
  }
}

export async function writeJson(dir: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(dir, file), JSON.stringify(value), "utf8");
}

const AT = "2026-11-21T10:00:00.000Z";

/** A regrowth whose rounds hold the given results, keyed by behavior id; enough for race and verify tests. */
export function regrowth(
  id: string,
  agent: AgentInfo["name"],
  rounds: readonly Readonly<Record<string, KaneOutcome>>[],
  options: { stack?: string; platform?: Target["platform"]; credits?: number } = {},
): Regrowth {
  return {
    id,
    target: { id, label: id, platform: options.platform ?? "web", stack: options.stack ?? "Next.js", original: false },
    agent: { name: agent, model: "default", version: "1.0.0" },
    startedAt: AT,
    endedAt: AT,
    rounds: rounds.map((results, index) => ({
      n: index + 1,
      startedAt: AT,
      endedAt: AT,
      diffStat: { files: 1, additions: 1, deletions: 0 },
      results: Object.entries(results).map(([behaviorId, result]) => ({ behaviorId, targetId: id, outcome: result })),
    })),
    creditsUsed: options.credits ?? 0,
  };
}

export function voyageOf(
  behaviors: readonly Behavior[],
  regrowths: readonly Regrowth[],
  baseline: Readonly<Record<string, KaneOutcome>> = {},
): Voyage {
  return {
    version: 1,
    id: "todo",
    title: "Todo, regrown",
    spec: {
      version: 1,
      app: {
        name: "Todo",
        description: "A todo list",
        origin: { id: "original", label: "Original", platform: "web", stack: "jQuery", url: "http://localhost:4170", original: true },
      },
      capturedAt: AT,
      behaviors: [...behaviors],
    },
    baseline: Object.entries(baseline).map(([behaviorId, result]) => ({ behaviorId, targetId: "original", outcome: result })),
    regrowths: [...regrowths],
  };
}
