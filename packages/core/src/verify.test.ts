import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeKaneClient, behavior, failed, outcome, regrowth, voyageOf } from "./__tests__/fakes.js";
import { computeParity } from "./parity.js";
import type { AppLauncher } from "./regrow/launcher.js";
import { compareCell, prepareLiveTarget, recordedOutcome, requireBehavior, resolveVerifyTarget, verifyCells } from "./verify.js";

const add = behavior("add-todo", { stores: ["items_left"] });
const edit = behavior("edit-todo", { stores: [] });
const stored = (value: string) => outcome({ finalState: { items_left: value } });

function voyage() {
  const nextjs = regrowth("nextjs", "codex", [{ "add-todo": stored("1"), "edit-todo": failed() }, { "edit-todo": outcome() }]);
  const base = voyageOf([add, edit], [nextjs], { "add-todo": stored("1 "), "edit-todo": outcome() });
  // Parity recorded a different stored value than the rounds did, so the tests can tell which one was read.
  const parityResults = [
    { behaviorId: "add-todo", targetId: "nextjs", outcome: stored("1 left") },
    { behaviorId: "edit-todo", targetId: "nextjs", outcome: outcome() },
  ];
  return { ...base, regrowths: [{ ...nextjs, parity: computeParity(base.spec, base.baseline, parityResults, "nextjs") }] };
}

describe("compareCell", () => {
  it("holds when the verdict and every stored value match after normalization", () => {
    const cell = compareCell(add, "nextjs", stored("1 item left"), stored(" 1  item left"));
    expect(cell).toMatchObject({ statusMatch: true, match: true });
    expect(cell.values).toEqual([{ key: "items_left", original: "1 item left", candidate: " 1  item left", equal: true }]);
  });

  it("breaks on a different stored value or a different verdict", () => {
    expect(compareCell(add, "nextjs", stored("1"), stored("2")).match).toBe(false);
    const flipped = compareCell(add, "nextjs", stored("1"), failed());
    expect(flipped).toMatchObject({ statusMatch: false, match: false });
  });

  it("holds when a recorded failure fails again, whatever it stored", () => {
    expect(compareCell(add, "nextjs", failed(), failed({ finalState: { items_left: "9" } })).match).toBe(true);
  });
});

describe("recordedOutcome", () => {
  it("reads the baseline for the original under either name", () => {
    const v = voyage();
    expect(recordedOutcome(v, "add-todo", "original").finalState).toEqual({ items_left: "1 " });
    expect(resolveVerifyTarget(v, "original").isOriginal).toBe(true);
  });

  it("prefers the parity row, then the target's final results", () => {
    const v = voyage();
    expect(recordedOutcome(v, "add-todo", "nextjs").finalState).toEqual({ items_left: "1 left" });
    const beforeParity = { ...v, regrowths: v.regrowths.map(({ parity: _parity, ...rest }) => rest) };
    expect(recordedOutcome(beforeParity, "add-todo", "nextjs").finalState).toEqual({ items_left: "1" });
    expect(recordedOutcome(beforeParity, "edit-todo", "nextjs").status).toBe("passed");
  });

  it("names the known targets and behaviors on a typo", () => {
    const v = voyage();
    expect(() => resolveVerifyTarget(v, "nuxt")).toThrow(/known: original, nextjs/);
    expect(() => requireBehavior(v, "nope")).toThrow(/no behavior "nope"/);
  });
});

describe("prepareLiveTarget", () => {
  const launcher: AppLauncher = {
    launchNpmApp: () => Promise.resolve({ url: "http://127.0.0.1:5123/", stop: () => Promise.resolve() }),
    launchCommand: () => Promise.reject(new Error("unused")),
    serveStatic: () => Promise.reject(new Error("unused")),
  };

  it("uses the original's URL, an explicit URL, or launches the workspace", async () => {
    const v = voyage();
    const original = await prepareLiveTarget(resolveVerifyTarget(v, "original"), { workspace: "/w", launcher });
    expect(original.target.url).toBe("http://localhost:4170");
    const deployed = await prepareLiveTarget(resolveVerifyTarget(v, "nextjs"), { workspace: "/w", launcher, url: "https://next.example" });
    expect(deployed.target.url).toBe("https://next.example");
    const launched = await prepareLiveTarget(resolveVerifyTarget(v, "nextjs"), { workspace: "/w", launcher });
    expect(launched.target.url).toBe("http://127.0.0.1:5123/");
    await expect(prepareLiveTarget(resolveVerifyTarget(v, "nextjs"), { workspace: "/w", launcher, app: "a.apk" })).rejects.toThrow(/--app applies to mobile/);
  });
});

describe("verifyCells", () => {
  it("runs each behavior once on the live target and reports every comparison", async () => {
    const v = voyage();
    const kane = new FakeKaneClient((b) => (b.id === "add-todo" ? stored("2 left") : outcome()));
    const workDir = await mkdtemp(join(tmpdir(), "theseus-verify-"));
    const seen: string[] = [];
    const target = { ...resolveVerifyTarget(v, "nextjs").target, url: "http://x" };
    const cells = await verifyCells(v, [add, edit], { target, stop: async () => {} }, "nextjs", {
      kane,
      workDir,
      timeoutS: 60,
      onResult: (cell) => seen.push(`${cell.behaviorId} ${cell.match ? "holds" : "breaks"}`),
    });
    expect(seen).toEqual(["add-todo breaks", "edit-todo holds"]);
    expect(cells.map((cell) => cell.fresh.status)).toEqual(["passed", "passed"]);
    expect(kane.calls.map((call) => [call.behaviorId, call.target.url, call.options.artifactsRoot])).toEqual([
      ["add-todo", "http://x", workDir],
      ["edit-todo", "http://x", workDir],
    ]);
  });
});
