import os from "node:os";
import path from "node:path";
import { KaneOutcome } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { resultFromFixture } from "./__fixtures__/helpers.js";
import { normalizeOutcome } from "./outcome.js";

describe("normalizeOutcome", () => {
  it("normalizes a pass with stored values", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/pass.ndjson")],
      stores: ["items_left", "todo_count"],
      timeoutS: 600,
    });
    expect(KaneOutcome.parse(outcome)).toEqual(outcome);
    expect(outcome).toMatchObject({
      status: "passed",
      exitCode: 0,
      oneLiner: "Added a todo on TodoMVC",
      reason: "Objective completed",
      durationS: 45.2,
      credits: 11.9,
      finalState: { url: "http://localhost:4170/#/all", items_left: "1 item left", todo_count: "1" },
      testUrl: "https://test-manager.lambdatest.com/projects/123/test-cases/456",
      sessionDir: path.join(os.homedir(), ".testmuai/kaneai/sessions/a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      artifacts: {},
    });
    expect(outcome.steps).toHaveLength(3);
    expect(outcome.failingStep).toBeUndefined();
    expect(outcome.bug).toBeUndefined();
    expect(outcome.rca).toBeUndefined();
  });

  it("records declared stores Kane did not return without failing the run", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/pass.ndjson")],
      stores: ["items_left", "todo_titles", "filter"],
      timeoutS: 600,
    });
    expect(outcome.status).toBe("passed");
    expect(outcome.reason).toBe("Objective completed Missing stored values: todo_titles, filter.");
  });

  it("normalizes a failure with its failing step and the verdict triage", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/fail.ndjson", { exitCode: 1 })],
      stores: [],
      timeoutS: 600,
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.failingStep).toEqual({ index: 3, remark: "Could not find Add to Cart button" });
    expect(outcome.steps.map((s) => s.status)).toEqual(["done", "done", "failed"]);
    expect(outcome.bug).toBeUndefined();
    expect(outcome.rca).toEqual({
      rootCause: "[product_bug] The product page renders no Add to Cart button.",
      suggestedFix: "Render the Add to Cart button for in-stock products.",
    });
  });

  it("prefers the evidence pack triage over the run_end verdict", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/fail.ndjson", { exitCode: 1 })],
      stores: [],
      timeoutS: 600,
      evidence: { artifacts: { failShot: "a/fail.png" }, rca: { rootCause: "pack", suggestedFix: "fix" }, warnings: [] },
    });
    expect(outcome.rca).toEqual({ rootCause: "pack", suggestedFix: "fix" });
    expect(outcome.artifacts).toEqual({ failShot: "a/fail.png" });
  });

  it("reports a confirmed product bug from result code 740 and legacy credits", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/bug740.ndjson", { exitCode: 1 })],
      stores: ["items_left"],
      timeoutS: 600,
    });
    expect(outcome.bug).toEqual({
      category: "functional",
      severity: "high",
      oneLiner: "Clear completed leaves completed todos in the list",
      confidence: 0.92,
    });
    expect(outcome.credits).toBe(12.5);
  });

  it("reports infrastructure errors after retries, summing credits across attempts", () => {
    const infra = resultFromFixture("synthetic/infra-error.ndjson", { exitCode: 2 });
    const outcome = normalizeOutcome({ attempts: [infra, infra, infra], stores: [], timeoutS: 600 });
    expect(outcome.status).toBe("error");
    expect(outcome.exitCode).toBe(2);
    expect(outcome.reason).toBe(
      "Infrastructure error after 3 attempts: Chrome failed to launch: CDP endpoint not reachable",
    );
    expect(outcome.credits).toBe(0);
    expect(outcome.steps).toEqual([]);
  });

  it("reports our own timeout as exit 3", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/infra-error.ndjson", { exitCode: null, timedOut: true, durationMs: 630_000 })],
      stores: [],
      timeoutS: 600,
    });
    expect(outcome).toMatchObject({ status: "timeout", exitCode: 3, durationS: 630 });
    expect(outcome.reason).toContain("600s wall-clock limit");
  });

  it("does not trust exit 0 when run_end says failed", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/fail.ndjson", { exitCode: 0 })],
      stores: [],
      timeoutS: 600,
    });
    expect(outcome.status).toBe("failed");
  });

  it("tolerates junk: drops invalid test_url and mistyped duration", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("synthetic/junk.ndjson", { durationMs: 2500 })],
      stores: ["items_left"],
      timeoutS: 600,
    });
    expect(outcome.status).toBe("passed");
    expect(outcome.testUrl).toBeUndefined();
    expect(outcome.durationS).toBe(2.5);
    expect(outcome.steps).toEqual([
      { index: 2, status: "done", remark: "navigate: opened the app" },
      { index: 4, status: "done", remark: "stored the counter" },
    ]);
  });

  it("normalizes the recorded TodoMVC pass", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("real/pass.ndjson")],
      stores: ["items_left", "todo_titles"],
      timeoutS: 600,
    });
    expect(outcome).toMatchObject({
      status: "passed",
      reason: "Objective completed",
      durationS: 62.8,
      finalState: { items_left: "2 items left", todo_titles: "Buy milk, Walk the dog, Write report" },
    });
    expect(outcome.credits).toBeGreaterThan(20);
    expect(outcome.steps).toHaveLength(11);
    expect(outcome.steps[0]?.index).toBe(2);
  });

  it("normalizes the recorded TodoMVC failure (result code 750 is not a bug)", () => {
    const outcome = normalizeOutcome({
      attempts: [resultFromFixture("real/fail.ndjson", { exitCode: 1 })],
      stores: ["items_left"],
      timeoutS: 600,
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.bug).toBeUndefined();
    expect(outcome.failingStep).toEqual({ index: 7, remark: "wait: Waiting after verifying the footer counter" });
    expect(outcome.rca?.rootCause.startsWith("[automation_bug] ")).toBe(true);
    expect(outcome.reason).toContain("Missing stored values: items_left.");
  });
});
