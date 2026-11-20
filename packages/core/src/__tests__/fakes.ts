import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, Behavior, KaneOutcome, Target } from "@theseus/schema";
import type { AgentRunInput, BuilderAgent } from "../agents/types.js";
import type { KaneClient, RunBehaviorOptions } from "../ports.js";

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
  readonly exports: { behaviors: readonly Behavior[]; outDir: string }[] = [];
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

  exportTestMd(behaviors: readonly Behavior[], _target: Target, outDir: string): Promise<string[]> {
    this.exports.push({ behaviors, outDir });
    return Promise.resolve(behaviors.map((b) => join(outDir, `${b.id}_test.md`)));
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
