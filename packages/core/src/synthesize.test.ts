import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STACK_PRESETS, catalogTargets, findPreset } from "./catalog.js";
import { TheseusConfig, loadConfig } from "./config.js";
import { renderConfigJson, synthesizeConfig, voyageIdFor } from "./synthesize.js";

describe("catalog", () => {
  it("has unique kebab-case ids and the four hero stacks", () => {
    const ids = STACK_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(findPreset("nextjs")?.platform).toBe("web");
    expect(findPreset("expo-android")?.platform).toBe("android");
    expect(findPreset("expo-ios")?.platform).toBe("ios");
    expect(findPreset("sveltekit")?.stack).toContain("adapter-node");
  });

  it("expands stacks for one agent with plain ids, deduplicating repeats", () => {
    const targets = catalogTargets(["nextjs", "expo-ios", "nextjs"], ["codex"]);
    expect(targets.map((target) => [target.id, target.label, target.agent])).toEqual([
      ["nextjs", "Next.js", "codex"],
      ["expo-ios", "Expo on iOS", "codex"],
    ]);
  });

  it("gives each agent its own target with the same stack in a race", () => {
    const targets = catalogTargets(["nextjs"], ["codex", "claude-code"]);
    expect(targets.map((target) => [target.id, target.label, target.agent, target.stack])).toEqual([
      ["nextjs-codex", "Next.js (Codex)", "codex", "Next.js (App Router, TypeScript)"],
      ["nextjs-claude", "Next.js (Claude Code)", "claude-code", "Next.js (App Router, TypeScript)"],
    ]);
  });

  it("names the known stacks when one is unknown", () => {
    expect(() => catalogTargets(["rails"], ["codex"])).toThrow(/unknown stack "rails"; known stacks: nextjs, sveltekit/);
    expect(() => catalogTargets([], ["codex"])).toThrow(/at least one stack/);
  });
});

describe("voyageIdFor", () => {
  it("derives a kebab-case id from host, port and path", () => {
    expect(voyageIdFor(new URL("http://localhost:4170"))).toBe("localhost-4170");
    expect(voyageIdFor(new URL("https://todo.example.com/app/"))).toBe("todo-example-com-app");
  });
});

describe("synthesizeConfig", () => {
  it("builds a validated config with defaults written out", () => {
    const config = synthesizeConfig({ url: "http://localhost:4170", to: ["nextjs", "sveltekit", "expo-android", "expo-ios"], agent: "codex", budget: 9000 });
    expect(TheseusConfig.parse(config)).toEqual(config);
    expect(config).toMatchObject({
      id: "localhost-4170",
      original: { id: "original", url: "http://localhost:4170/" },
      budgetCredits: 9000,
      rounds: 5,
      draftAgent: { agent: "codex" },
      concurrency: { web: 2, mobile: 1, targets: 2 },
    });
    expect(config.targets.map((target) => target.id)).toEqual(["nextjs", "sveltekit", "expo-android", "expo-ios"]);
    expect(config.targets.every((target) => target.agent === "codex")).toBe(true);
  });

  it("defaults to Claude Code and honours --name and --docs", () => {
    const config = synthesizeConfig({ url: "https://app.test", to: ["nextjs"], name: "my-app", docs: ["docs/spec.md"] });
    expect(config.id).toBe("my-app");
    expect(config.docs).toEqual(["docs/spec.md"]);
    expect(config.app.description).toContain("and its docs");
    expect(config.targets[0]?.agent).toBe("claude-code");
  });

  it("races agents on the same stack", () => {
    const config = synthesizeConfig({ url: "http://localhost:4170", to: ["nextjs"], race: ["codex", "claude-code"] });
    expect(config.targets.map((target) => target.id)).toEqual(["nextjs-codex", "nextjs-claude"]);
    expect(config.draftAgent.agent).toBe("codex");
  });

  it("rejects bad input with a message that says what to do", () => {
    expect(() => synthesizeConfig({ url: "localhost:4170", to: ["nextjs"] })).toThrow(/http or https/);
    expect(() => synthesizeConfig({ url: "not a url", to: ["nextjs"] })).toThrow(/is not a URL/);
    expect(() => synthesizeConfig({ url: "http://a.test", to: ["nextjs"], name: "My App" })).toThrow(/kebab-case, e.g. my-app/);
    expect(() => synthesizeConfig({ url: "http://a.test", to: ["nextjs"], race: ["codex"] })).toThrow(/two different agents/);
    expect(() => synthesizeConfig({ url: "http://a.test", to: ["nextjs"], race: ["codex", "claude-code"], agent: "codex" })).toThrow(/not both/);
    expect(() => synthesizeConfig({ url: "http://a.test", to: ["nextjs"], budget: -1 })).toThrow(/budgetCredits/);
  });
});

describe("renderConfigJson", () => {
  it("writes an annotated config that loads back to the same thing", async () => {
    const config = synthesizeConfig({ url: "http://localhost:4170", to: ["nextjs"], agent: "codex" });
    const text = renderConfigJson(config, "theseus init http://localhost:4170 --to nextjs");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    const dir = await mkdtemp(join(tmpdir(), "theseus-init-"));
    await writeFile(join(dir, "theseus.config.json"), text, "utf8");
    const loaded = await loadConfig("theseus.config.json", dir);
    expect(loaded.targets).toEqual(config.targets);
    expect((JSON.parse(text) as { "//": string[] })["//"][0]).toContain("theseus init");
  });
});
