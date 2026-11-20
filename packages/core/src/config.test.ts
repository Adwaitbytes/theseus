import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "./config.js";
import { TheseusError } from "./errors.js";

const minimal = {
  id: "todomvc-jquery",
  title: "TodoMVC",
  app: { name: "TodoMVC", description: "A todo list" },
  original: { stack: "jQuery", url: "http://localhost:4170", source: "original" },
  docs: ["docs/spec.md"],
  targets: [{ id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js" }],
};

describe("parseConfig", () => {
  it("applies defaults and resolves paths against the config file and the cwd", () => {
    const config = parseConfig(minimal, "examples/app/theseus.config.json", "/repo");
    expect(config.rounds).toBe(5);
    expect(config.concurrency).toEqual({ web: 2, mobile: 1, targets: 2 });
    expect(config.strength).toEqual({ enabled: true, mutants: 8, maxRunsPerMutant: 5 });
    expect(config.kane.creditsPerRun).toBe(21);
    expect(config.targets[0]?.agent).toBe("claude-code");
    expect(config.original.id).toBe("original");
    expect(config.original.source).toBe("/repo/examples/app/original");
    expect(config.docs).toEqual(["/repo/examples/app/docs/spec.md"]);
    expect(config.runsDir).toBe("/repo/runs");
    expect(config.workDir).toBe("/repo/.theseus/work");
    expect(config.budgetCredits).toBeUndefined();
  });

  it("rejects bad ids, unknown platforms and duplicate targets with readable paths", () => {
    const bad = {
      ...minimal,
      id: "Not A Slug",
      targets: [
        { id: "web", label: "A", platform: "web", stack: "Next.js" },
        { id: "web", label: "B", platform: "windows", stack: "x" },
      ],
    };
    try {
      parseConfig(bad, "c.json", "/repo");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TheseusError);
      const message = (error as TheseusError).message;
      expect((error as TheseusError).code).toBe("config-invalid");
      expect(message).toContain("id: expected kebab-case");
      expect(message).toContain("targets.1.platform");
    }
  });

  it("rejects a target id that collides with the original", () => {
    const clash = { ...minimal, targets: [{ id: "original", label: "x", platform: "web", stack: "Next.js" }] };
    expect(() => parseConfig(clash, "c.json", "/repo")).toThrow(/duplicate target id "original"/);
  });

  it("requires at least one target and a valid original url", () => {
    expect(() => parseConfig({ ...minimal, targets: [] }, "c.json", "/repo")).toThrow(TheseusError);
    expect(() => parseConfig({ ...minimal, original: { stack: "x", url: "not a url" } }, "c.json", "/repo")).toThrow(/original.url/);
  });
});

describe("loadConfig", () => {
  it("reports unreadable and malformed files as config errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-config-"));
    await expect(loadConfig(join(dir, "missing.json"))).rejects.toMatchObject({ code: "config-invalid" });
    await writeFile(join(dir, "broken.json"), "{ nope", "utf8");
    await expect(loadConfig(join(dir, "broken.json"))).rejects.toThrow(/not valid JSON/);
  });

  it("accepts the shipped TodoMVC example", async () => {
    const path = resolve(import.meta.dirname, "../../../examples/todomvc-jquery/theseus.config.json");
    const config = await loadConfig(path, resolve(import.meta.dirname, "../../.."));
    expect(config.targets.map((target) => target.id)).toEqual(["nextjs", "sveltekit", "expo-android", "expo-ios"]);
    expect(config.original.url).toBe("http://localhost:4170");
    expect(JSON.parse(await readFile(path, "utf8"))).toBeTypeOf("object");
  });
});
