import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCell, type KaneClient, type RunSuiteOptions, type SuiteMember, type SuiteResult } from "@theseus/core";
import type { Behavior, KaneOutcome, Voyage } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { colorizer } from "./output.js";
import { renderMemberLine, renderSuiteSummary, suite, suiteExitCode } from "./suite.js";
import { renderVerifyFooter, verify } from "./verify.js";
import { commandFor, init } from "./zero-config.js";

const plain = colorizer(false);
const AT = "2026-11-21T10:00:00.000Z";
const add: Behavior = { id: "add-todo", title: "Add a todo", area: "Todos", objective: "Add a todo called Milk and store the counter as items_left.", stores: ["items_left"], tags: [], source: "capture" };
const result = (status: KaneOutcome["status"], items?: string): KaneOutcome => ({
  status,
  exitCode: status === "passed" ? 0 : 1,
  oneLiner: status === "passed" ? "ok" : "counter missing",
  reason: "",
  durationS: 30,
  credits: 21,
  finalState: items === undefined ? {} : { items_left: items },
  steps: [],
  artifacts: {},
});

const voyage: Voyage = {
  version: 1,
  id: "todo",
  title: "Todo",
  spec: {
    version: 1,
    app: { name: "Todo", description: "x", origin: { id: "original", label: "Original", platform: "web", stack: "jQuery", url: "http://localhost:4170", original: true } },
    capturedAt: AT,
    behaviors: [add],
  },
  baseline: [{ behaviorId: "add-todo", targetId: "original", outcome: result("passed", "1") }],
  regrowths: [
    {
      id: "nextjs",
      target: { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", original: false },
      agent: { name: "codex", model: "default", version: "1" },
      startedAt: AT,
      endedAt: AT,
      rounds: [{ n: 1, startedAt: AT, endedAt: AT, diffStat: { files: 1, additions: 1, deletions: 0 }, results: [{ behaviorId: "add-todo", targetId: "nextjs", outcome: result("passed", "1") }] }],
      creditsUsed: 21,
    },
  ],
};

async function runDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "theseus-run-"));
  await writeFile(join(dir, "voyage.json"), JSON.stringify(voyage), "utf8");
  return dir;
}

class StubKane implements KaneClient {
  readonly suites: RunSuiteOptions[] = [];
  readonly exported: string[] = [];
  constructor(
    readonly fresh: KaneOutcome,
    readonly suiteResult: SuiteResult = { status: "passed", exitCode: 0, planValid: true, planned: [], refused: [], members: [], durationS: 1 },
  ) {}
  version = () => Promise.resolve("0.10.7");
  balance = () => Promise.resolve(1000);
  runBehavior = () => Promise.resolve(this.fresh);
  exportTestMd = async (behaviors: readonly Behavior[], _target: unknown, outDir: string) => {
    this.exported.push(outDir);
    await mkdir(outDir, { recursive: true });
    const files = behaviors.map((b) => join(outDir, `${b.id}_test.md`));
    for (const file of files) await writeFile(file, "---\n---\n", "utf8");
    return files;
  };
  runSuite = (options: RunSuiteOptions) => {
    this.suites.push(options);
    return Promise.resolve(this.suiteResult);
  };
}

function deps(kane: KaneClient) {
  let out = "";
  return {
    deps: { kane, loadMobile: () => Promise.resolve(undefined), write: (text: string) => (out += text), color: plain, now: () => new Date(AT) },
    out: () => out,
  };
}

describe("theseus verify", () => {
  it("shows recorded and fresh side by side and exits 0 when the cell holds", async () => {
    const dir = await runDir();
    const { deps: d, out } = deps(new StubKane(result("passed", "1")));
    const code = await verify(dir, { behavior: "add-todo", target: "nextjs", url: "http://127.0.0.1:9", workDir: join(dir, "work"), timeout: 60 }, d);
    expect(code).toBe(0);
    expect(out()).toContain("add-todo  holds");
    expect(out()).toMatch(/verdict {7}passed {24}passed/);
    expect(out()).toMatch(/items_left {4}"1" {27}"1"/);
    expect(out()).toContain("1 of 1 cell hold. The certificate stands.");
  });

  it("exits 1 on a mismatch and verifies the original by its alias", async () => {
    const dir = await runDir();
    const { deps: d, out } = deps(new StubKane(result("passed", "2")));
    expect(await verify(dir, { all: true, target: "original", workDir: join(dir, "work"), timeout: 60 }, d)).toBe(1);
    expect(out()).toContain("Behavior");
    expect(out()).toContain("1 of 1 cell no longer match the certificate.");
  });

  it("rejects ambiguous or missing selections", async () => {
    const dir = await runDir();
    const { deps: d } = deps(new StubKane(result("passed")));
    await expect(verify(dir, { target: "nextjs", workDir: dir, timeout: 1 }, d)).rejects.toThrow(/--behavior <id>/);
    await expect(verify(dir, { all: true, behavior: "add-todo", target: "nextjs", workDir: dir, timeout: 1 }, d)).rejects.toThrow(/not both/);
    await expect(verify(join(dir, "nope"), { all: true, target: "nextjs", workDir: dir, timeout: 1 }, d)).rejects.toThrow(/no voyage.json/);
  });

  it("lists only broken cells in detail after an --all table", () => {
    const holds = compareCell(add, "nextjs", result("passed", "1"), result("passed", "1"));
    const breaks = compareCell(add, "nextjs", result("passed", "1"), result("failed"));
    const text = renderVerifyFooter([holds, breaks], true, plain);
    expect(text.match(/add-todo {2}(holds|breaks)/g)).toEqual(["add-todo  breaks"]);
    expect(text).toContain("failed: counter missing");
  });
});

describe("theseus suite", () => {
  const broken: SuiteMember = { path: "/x/b_test.md", file: "b_test.md", status: "failed", durationS: 61, authored: false, logPath: "/logs/b.ndjson", failure: { message: "no edit field", stepIndex: 3 } };
  const failing: SuiteResult = {
    status: "failed",
    exitCode: 1,
    planValid: true,
    planned: ["a_test.md", "b_test.md"],
    refused: [],
    members: [{ path: "/x/a_test.md", file: "a_test.md", status: "passed", durationS: 12, authored: false }, broken],
    durationS: 75,
    totals: { tests: 2, passed: 1, failed: 1, broken: 0, skipped: 0, authored: 0 },
  };

  it("renders members and a rollup with the failing test's reason and log", () => {
    expect(renderMemberLine(broken, plain)).toMatch(/× b_test\.md\s+failed\s+01:01 {2}step 3: no edit field/);
    const summary = renderSuiteSummary(failing, plain);
    expect(summary).toContain("Suite  1 of 2 tests passed  01:15");
    expect(summary).toContain("log /logs/b.ndjson");
    expect(renderSuiteSummary({ ...failing, status: "error", planValid: false, members: [], refused: [{ path: "b_test.md", reason: "org_mismatch" }] }, plain)).toContain("Kane refused the plan");
  });

  it("maps suite outcomes to exit codes", () => {
    expect((["passed", "failed", "error", "cancelled", "timeout"] as const).map((status) => suiteExitCode({ ...failing, status }))).toEqual([0, 1, 2, 130, 1]);
  });

  it("exports a missing suite into the run, then runs it with Kane", async () => {
    const dir = await runDir();
    const kane = new StubKane(result("passed"), failing);
    const { deps: d, out } = deps(kane);
    const code = await suite(dir, { target: "nextjs", parallel: 3, workDir: join(dir, "work") }, d);
    expect(code).toBe(1);
    expect(kane.exported).toEqual([join(dir, "spec", "nextjs")]);
    expect(kane.suites[0]).toMatchObject({ dir: join(dir, "spec", "nextjs"), parallel: 3, headless: true, name: "theseus todo nextjs" });
    expect(out()).toContain("Running the Next.js suite with Kane (1 test, 3 workers)");
  });

  it("re-renders into the work directory for --url, leaving the committed suite alone", async () => {
    const dir = await runDir();
    const kane = new StubKane(result("passed"));
    const { deps: d } = deps(kane);
    expect(await suite(dir, { target: "nextjs", parallel: 1, url: "https://next.example", workDir: join(dir, "work") }, d)).toBe(0);
    expect(kane.suites[0]?.dir).toBe(join(dir, "work", "todo", "suite", "nextjs"));
    await expect(suite(dir, { target: "nextjs", parallel: 1, app: "a.apk", workDir: dir }, d)).rejects.toThrow(/--app applies to mobile/);
  });
});

describe("theseus init", () => {
  it("writes a config whose docs resolve from the config file, and refuses to overwrite", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "theseus-init-"));
    await mkdir(join(cwd, "docs"));
    await writeFile(join(cwd, "docs", "spec.md"), "# spec", "utf8");
    const request = { url: "http://localhost:4170", to: ["nextjs", "expo-ios"], race: ["codex", "claude-code"] as const, docs: ["docs/spec.md"] };
    let out = "";
    expect(await init({ ...request, race: [...request.race] }, { out: "configs/theseus.json" }, cwd, (text) => (out += text))).toBe(0);
    const written = JSON.parse(await readFile(join(cwd, "configs", "theseus.json"), "utf8")) as { docs: string[]; targets: { id: string }[]; "//": string[] };
    expect(written.docs).toEqual(["../docs/spec.md"]);
    expect(written.targets.map((target) => target.id)).toEqual(["nextjs-codex", "nextjs-claude", "expo-ios-codex", "expo-ios-claude"]);
    expect(written["//"][0]).toBe("Generated by: theseus init http://localhost:4170 --to nextjs,expo-ios --race codex,claude-code --docs docs/spec.md");
    expect(out).toContain("theseus voyage configs/theseus.json");
    await expect(init({ ...request, race: [...request.race] }, { out: "configs/theseus.json" }, cwd, () => {})).rejects.toThrow(/--force/);
    await expect(init({ url: "http://a.test", to: ["nextjs"], docs: ["missing.md"] }, { out: "x.json" }, cwd, () => {})).rejects.toThrow(/not a file/);
  });

  it("reproduces every flag in the provenance command", () => {
    expect(commandFor("regrow", { url: "http://a.test", to: ["nextjs"], agent: "codex", name: "a", budget: 900, rounds: 3 })).toBe(
      "theseus regrow http://a.test --to nextjs --agent codex --name a --budget 900 --rounds 3",
    );
  });
});
