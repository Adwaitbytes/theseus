import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_KANE, fixture, readFixture, scenarioEnv, tempDir, type FakeScenario } from "./__fixtures__/helpers.js";
import { createKaneClient } from "./client.js";
import type { SuiteMemberEvent } from "./contract.js";
import { KaneSuiteError } from "./errors.js";
import type { KaneProcessResult } from "./process.js";
import { buildTestrunArgs, parseTestrunLine, parseTestrunStream, suiteStatusFromExit, summarizeSuite } from "./testrun.js";

function processResult(stdoutFixture: string, overrides: Partial<KaneProcessResult> = {}): KaneProcessResult {
  return {
    exitCode: 0,
    killSignal: null,
    timedOut: false,
    events: [],
    stdout: readFixture(stdoutFixture),
    stderr: "",
    durationMs: 5_000,
    ...overrides,
  };
}

describe("parseTestrunLine", () => {
  it("recognises the five suite events and ignores the rest", () => {
    const kinds = parseTestrunStream(readFixture("synthetic/testrun-pass.ndjson")).map((event) => event.kind);
    expect(kinds).toEqual(["plan", "member_start", "member_start", "member_end", "member_end", "summary", "done"]);
  });

  it("keeps a member end whose duration drifted to a string, dropping only that field", () => {
    const event = parseTestrunLine('{"type":"testrun_member_end","path":"a_test.md","status":"failed","duration_s":"slow"}');
    expect(event).toEqual({
      kind: "member_end",
      event: { type: "testrun_member_end", path: "a_test.md", status: "failed", duration_s: undefined, test_id: undefined, log_path: undefined, failure: undefined },
    });
  });

  it("reduces an object plan failure to its message and skips junk", () => {
    const plan = parseTestrunLine('{"type":"testrun_plan","valid":false,"members":[{"path":"a_test.md","failure":{"reason":"org_mismatch"}}]}');
    expect(plan?.kind === "plan" ? plan.event.members[0]?.failure : undefined).toBe("org_mismatch");
    expect(parseTestrunLine("Replaying recorded steps")).toBeNull();
    expect(parseTestrunLine('{"type":"testrun_member_end"}')).toBeNull();
    expect(parseTestrunLine('{"step":1,"status":"done"}')).toBeNull();
  });
});

describe("summarizeSuite", () => {
  it("rolls up a green suite", () => {
    const result = summarizeSuite(processResult("synthetic/testrun-pass.ndjson"));
    expect(result).toMatchObject({
      status: "passed",
      planValid: true,
      executionId: "exec-77",
      durationS: 27.3,
      totals: { tests: 2, passed: 2, failed: 0, broken: 0, skipped: 0, authored: 0 },
    });
    expect(result.members.map((member) => [member.file, member.status, member.testId])).toEqual([
      ["add-todo_test.md", "passed", "t-add"],
      ["footer-counter_test.md", "passed", "t-counter"],
    ]);
    expect(result.stderr).toBeUndefined();
  });

  it("keeps failures, authored members and unknown statuses as broken", () => {
    const result = summarizeSuite(processResult("synthetic/testrun-fail.ndjson", { exitCode: 1, stderr: " member failed \n" }));
    expect(result.status).toBe("failed");
    expect(result.stderr).toBe("member failed");
    const edit = result.members.find((member) => member.file === "edit-todo_test.md");
    expect(edit).toMatchObject({ status: "failed", durationS: 0, failure: { message: "Double-clicking the todo did not open an edit field", stepIndex: 3 } });
    const authored = result.members.find((member) => member.file === "clear-completed_test.md");
    expect(authored).toMatchObject({ status: "broken", authored: true, path: "spec/nextjs/clear-completed_test.md" });
  });

  it("reports a refused plan with each offender", () => {
    const result = summarizeSuite(processResult("synthetic/testrun-invalid.ndjson", { exitCode: 2 }));
    expect(result).toMatchObject({ status: "error", planValid: false, members: [], durationS: 5 });
    expect(result.refused).toEqual([{ path: "/work/spec/nextjs/edit-todo_test.md", reason: "project_mismatch" }]);
  });

  it("maps exit codes and our own timeout", () => {
    expect([0, 1, 2, 3, null].map((code) => suiteStatusFromExit(code, false))).toEqual(["passed", "failed", "error", "cancelled", "error"]);
    expect(suiteStatusFromExit(0, true)).toBe("timeout");
  });
});

describe("buildTestrunArgs", () => {
  it("defaults to one headless worker and passes optional flags through", () => {
    expect(buildTestrunArgs(["a_test.md"])).toEqual(["testrun", "run", "a_test.md", "--agent", "--parallel", "1", "--headless"]);
    expect(
      buildTestrunArgs(["a_test.md", "b_test.md"], {
        parallel: 4,
        headless: false,
        onFailure: "fail-fast",
        name: "theseus nextjs",
        device: { name: "Pixel 7", osVersion: "14" },
      }),
    ).toEqual([
      "testrun", "run", "a_test.md", "b_test.md", "--agent", "--parallel", "4",
      "--on-failure", "fail-fast", "--name", "theseus nextjs", "--device-name", "Pixel 7", "--os-version", "14",
    ]);
  });
});

describe("KaneClient.runSuite", () => {
  function client(dir: string, scenario: FakeScenario) {
    return createKaneClient({ bin: FAKE_KANE, env: scenarioEnv(dir, scenario) });
  }

  it("discovers the suite's files, runs them in the suite directory and streams member events", async () => {
    const dir = tempDir();
    const work = tempDir();
    for (const file of ["footer-counter_test.md", "add-todo_test.md", "notes.md"]) writeFileSync(path.join(work, file), "---\n---\n");
    const argsFile = path.join(dir, "args.json");
    const events: SuiteMemberEvent[] = [];
    const result = await client(dir, { stdoutFile: fixture("synthetic/testrun-pass.ndjson"), chunkSize: 7, argsFile }).runSuite({
      dir: work,
      parallel: 2,
      name: "theseus nextjs",
      onMember: (event) => events.push(event),
    });
    expect(result.status).toBe("passed");
    const recorded = JSON.parse(readFileSync(argsFile, "utf8")) as { args: string[]; stdinIsTTY: boolean };
    expect(recorded.args).toEqual([
      "testrun", "run", "add-todo_test.md", "footer-counter_test.md", "--agent", "--parallel", "2", "--headless", "--name", "theseus nextjs",
    ]);
    expect(recorded.stdinIsTTY).toBe(false);
    expect(events.map((event) => (event.kind === "start" ? `start ${path.basename(event.path)}` : `end ${event.member.file} ${event.member.status}`))).toEqual([
      "start add-todo_test.md",
      "start footer-counter_test.md",
      "end add-todo_test.md passed",
      "end footer-counter_test.md passed",
    ]);
  });

  it("returns a failed suite as a result, not an error", async () => {
    const dir = tempDir();
    const result = await client(dir, { stdoutFile: fixture("synthetic/testrun-fail.ndjson"), exitCode: 1 }).runSuite({
      dir,
      files: ["add-todo_test.md", "edit-todo_test.md"],
    });
    expect(result.status).toBe("failed");
    expect(result.members.filter((member) => member.status !== "passed")).toHaveLength(2);
  });

  it("refuses to start without test files", async () => {
    const dir = tempDir();
    await expect(client(dir, {}).runSuite({ dir })).rejects.toBeInstanceOf(KaneSuiteError);
    await expect(client(dir, {}).runSuite({ dir, files: ["README.md"] })).rejects.toThrow(/must end in _test.md/);
    await expect(client(dir, {}).runSuite({ dir: path.join(dir, "missing") })).rejects.toThrow(/cannot read suite directory/);
  });
});
