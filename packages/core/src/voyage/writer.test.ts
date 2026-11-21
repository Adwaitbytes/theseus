import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Regrowth, Voyage } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { VoyageWriter } from "./index.js";
import { readVoyage } from "./store.js";

const base: Voyage = {
  version: 1,
  id: "todo",
  title: "Todo",
  spec: {
    version: 1,
    app: { name: "Todo", description: "todos", origin: { id: "original", label: "Original", platform: "web", stack: "jquery", original: true } },
    capturedAt: "2026-11-21T00:00:00.000Z",
    behaviors: [{ id: "add-item", title: "Add item", area: "Adding", objective: "Add an item and store the counter as 'counter'", stores: ["counter"], tags: [], source: "capture" }],
  },
  baseline: [],
  regrowths: [],
};

const regrowth = (id: string): Regrowth => ({
  id,
  target: { id, label: id, platform: "web", stack: id, original: false },
  agent: { name: "codex", model: "m", version: "1" },
  startedAt: "2026-11-21T00:00:00.000Z",
  endedAt: "2026-11-21T00:00:00.000Z",
  rounds: [],
  creditsUsed: 0,
});

describe("VoyageWriter", () => {
  it("keeps regrowths written by another process that shares the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-writer-"));
    const file = join(dir, "voyage.json");
    await writeFile(file, JSON.stringify(base));
    // Two writers loaded the same starting file, like two `theseus regrow --target` processes.
    const a = new VoyageWriter(file, base);
    const b = new VoyageWriter(file, base);
    await a.update((v) => ({ ...(v ?? base), regrowths: [...(v ?? base).regrowths.filter((r) => r.id !== "nextjs"), regrowth("nextjs")] }));
    await b.update((v) => ({ ...(v ?? base), regrowths: [...(v ?? base).regrowths.filter((r) => r.id !== "sveltekit"), regrowth("sveltekit")] }));
    const onDisk = await readVoyage(file);
    expect(onDisk?.regrowths.map((r) => r.id).sort()).toEqual(["nextjs", "sveltekit"]);
  });
});
