import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Voyage } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { FakeAgent, FakeKaneClient, behavior, failed, outcome } from "../__tests__/fakes.js";
import type { CrawlOptions, CrawlResult } from "../capture/crawl.js";
import { parseConfig, type ResolvedConfig } from "../config.js";
import type { EngineDeps } from "../context.js";
import { EventBus } from "../events/bus.js";
import { readEvents } from "../events/recorder.js";
import type { AppLauncher } from "../regrow/launcher.js";
import { completedPhases, runVoyage } from "./index.js";
import { readVoyage, voyagePaths } from "./store.js";

const drafted = Array.from({ length: 12 }, (_, i) => behavior(`behavior-${i + 1}`, { area: i % 2 === 0 ? "Adding" : "Editing" }));

async function setup(): Promise<{ config: ResolvedConfig; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "theseus-voyage-"));
  const config = parseConfig(
    {
      id: "todo",
      title: "Todo voyage",
      app: { name: "Todo", description: "todos" },
      original: { stack: "jQuery", url: "http://127.0.0.1:4170" },
      targets: [{ id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js" }],
      strength: { enabled: false },
    },
    "theseus.config.json",
    root,
  );
  return { config, root };
}

const fakeCrawl = async (options: CrawlOptions): Promise<CrawlResult> => {
  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, "page-1.png"), "png", "utf8");
  return { startUrl: options.startUrl, crawledAt: "2026-11-21T10:00:00.000Z", pages: [], states: [] };
};

const fakeLauncher: AppLauncher = {
  launchNpmApp: async () => ({ url: "http://127.0.0.1:3999/", stop: async () => {} }),
  launchCommand: async () => ({ url: "http://127.0.0.1:3998/", stop: async () => {} }),
  serveStatic: async () => ({ url: "http://127.0.0.1:3997/", stop: async () => {} }),
};

/** The original fails behavior-3 with an automation_bug RCA until the drafting agent rewrites it. */
function deps(): { deps: EngineDeps; kane: FakeKaneClient; agent: FakeAgent; bus: EventBus } {
  const kane = new FakeKaneClient((b) =>
    b.objective.includes("REWRITTEN") || b.id !== "behavior-3"
      ? outcome({
          finalState: { [b.stores[0] ?? "x"]: "2" },
          sessionDir: "/Users/someone/.testmuai/sessions/1",
          artifacts: { finalShot: "artifacts/x/final.png", evidencePack: "/Users/someone/evidence.zip" },
        })
      : failed({ rca: { rootCause: "[automation_bug] The objective expects a button that does not exist", suggestedFix: "Press Enter instead." } }),
  );
  const agent = new FakeAgent(async (input) => {
    if (input.prompt.includes("behavioral specification")) {
      await writeFile(join(input.cwd, "behaviors.json"), JSON.stringify({ behaviors: drafted }), "utf8");
    } else if (input.prompt.includes("blames the test")) {
      const fixed = { ...behavior("behavior-3"), objective: `${behavior("behavior-3").objective} REWRITTEN` };
      await writeFile(join(input.cwd, "behaviors.json"), JSON.stringify({ behaviors: [fixed] }), "utf8");
    } else {
      await writeFile(join(input.cwd, "page.tsx"), `export default 1; // ${input.prompt.length}\n`, "utf8");
    }
  });
  const bus = new EventBus();
  return { deps: { kane, bus, createAgent: () => agent, crawl: fakeCrawl, launcher: fakeLauncher }, kane, agent, bus };
}

describe("runVoyage", () => {
  it("runs every phase, writes a valid voyage and resumes without repeating work", async () => {
    const { config } = await setup();
    const first = deps();
    const voyage = await runVoyage(config, first.deps);
    const paths = voyagePaths(config.runsDir, config.id);

    expect(voyage.spec.behaviors).toHaveLength(12);
    expect(voyage.spec.behaviors.find((b) => b.id === "behavior-3")?.objective).toContain("REWRITTEN");
    expect(voyage.baseline).toHaveLength(12);
    expect(voyage.regrowths).toHaveLength(1);
    const regrowth = voyage.regrowths[0];
    expect(regrowth?.rounds).toHaveLength(1);
    expect(regrowth?.parity?.summary).toEqual({ identical: 12, diverged: 0, failed: 0, total: 12 });
    expect(regrowth?.creditsUsed).toBe(240);
    expect(first.kane.exports).toHaveLength(1);

    const onDisk = JSON.parse(await readFile(paths.voyageJson, "utf8")) as unknown;
    expect(Voyage.safeParse(onDisk).success).toBe(true);
    const events = await readEvents(paths.events);
    expect(events.filter((e) => e.type === "phase").map((e) => (e.type === "phase" ? e.phase : ""))).toEqual([
      "capture",
      "baseline",
      "regrow",
      "parity",
      "done",
    ]);
    expect(events.some((e) => e.type === "log" && e.message.includes("redrafting with kane's suggested fix"))).toBe(true);
    const credits = JSON.parse(await readFile(paths.credits, "utf8")) as { used: number };
    expect(credits.used).toBe(20 * (12 + 1 + 12));

    const callsBefore = first.kane.calls.length;
    const second = deps();
    const again = await runVoyage(config, second.deps);
    expect(second.kane.calls).toHaveLength(0);
    expect(second.agent.prompts).toHaveLength(0);
    expect(again).toEqual(voyage);
    expect(first.kane.calls).toHaveLength(callsBefore);
    const all = await readEvents(paths.events);
    expect(all.some((e) => e.type === "log" && e.message.startsWith("capture: already complete"))).toBe(true);
  });

  it("never persists absolute home paths or evidence packs", async () => {
    const { config } = await setup();
    await runVoyage(config, deps().deps);
    const paths = voyagePaths(config.runsDir, config.id);
    for (const file of [paths.voyageJson, paths.events]) {
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("/Users/");
      expect(text).not.toContain("evidencePack");
      expect(text).not.toContain("sessionDir");
    }
  });

  it("redoes only the forced phase", async () => {
    const { config } = await setup();
    await runVoyage(config, deps().deps);
    const forced = deps();
    await runVoyage(config, forced.deps, { force: ["parity"] });
    expect(forced.kane.calls).toHaveLength(0);
    const events = await readEvents(voyagePaths(config.runsDir, config.id).events);
    expect(events.filter((e) => e.type === "phase" && e.phase === "parity")).toHaveLength(2);
  });

  it("runs a single phase on request and refuses one whose input is missing", async () => {
    const { config } = await setup();
    await expect(runVoyage(config, deps().deps, { phases: ["baseline"] })).rejects.toMatchObject({ code: "phase-precondition" });
    const only = deps();
    const voyage = await runVoyage(config, only.deps, { phases: ["capture"] });
    expect(voyage.baseline).toEqual([]);
    expect(only.kane.calls).toHaveLength(0);
    const stored = await readVoyage(voyagePaths(config.runsDir, config.id).voyageJson);
    expect(completedPhases(stored, config)).toEqual(new Set(["capture"]));
  });

  it("refuses a phase the credit budget cannot cover before spending anything", async () => {
    const { config } = await setup();
    const tight = { ...config, budgetCredits: 100 };
    const run = deps();
    await expect(runVoyage(tight, run.deps)).rejects.toMatchObject({ code: "budget-exceeded" });
    expect(run.kane.calls).toHaveLength(0);
  });
});
