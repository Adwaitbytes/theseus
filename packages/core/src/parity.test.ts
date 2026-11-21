import type { Spec } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { behavior, failed, outcome } from "./__tests__/fakes.js";
import { computeParity, normalizeValue, valuesEqual } from "./parity.js";

describe("normalizeValue", () => {
  it("trims, collapses inner whitespace and strips one layer of matching quotes", () => {
    expect(normalizeValue("  2   items\n left ")).toBe("2 items left");
    expect(normalizeValue(`"Buy milk"`)).toBe("Buy milk");
    expect(normalizeValue("'x'")).toBe("x");
    expect(normalizeValue(`"mismatched'`)).toBe(`"mismatched'`);
  });
});

describe("valuesEqual", () => {
  it("compares normalized text exactly, keeping case for ordinary strings", () => {
    expect(valuesEqual("Buy  milk", " Buy milk")).toBe(true);
    expect(valuesEqual("Buy milk", "buy milk")).toBe(false);
  });

  it("treats booleans case-insensitively", () => {
    expect(valuesEqual("True", "true")).toBe(true);
    expect(valuesEqual("FALSE", "false")).toBe(true);
    expect(valuesEqual("true", "false")).toBe(false);
  });

  it("compares numbers by value", () => {
    expect(valuesEqual("3", "3.0")).toBe(true);
    expect(valuesEqual("1,000", "1000")).toBe(true);
    expect(valuesEqual(" 2 ", "2")).toBe(true);
    expect(valuesEqual("2", "3")).toBe(false);
    expect(valuesEqual("2 items", "2")).toBe(false);
  });

  it("only matches a missing value with another missing value", () => {
    expect(valuesEqual(null, null)).toBe(true);
    expect(valuesEqual(null, "")).toBe(false);
  });
});

describe("computeParity", () => {
  const spec: Spec = {
    version: 1,
    app: { name: "Todo", description: "todos", origin: { id: "original", label: "Original", platform: "web", stack: "jquery", original: true } },
    capturedAt: "2026-11-21T00:00:00.000Z",
    behaviors: [
      behavior("add-item", { stores: ["count"] }),
      behavior("edit-item", { stores: ["label"] }),
      behavior("toggle-all", { stores: ["all_done"] }),
      behavior("filter-active", { stores: ["visible"] }),
    ],
  };
  const baseline = [
    { behaviorId: "add-item", targetId: "original", outcome: outcome({ finalState: { count: "2" } }) },
    { behaviorId: "edit-item", targetId: "original", outcome: outcome({ finalState: { label: "Walk the dog" } }) },
    { behaviorId: "toggle-all", targetId: "original", outcome: outcome({ finalState: { all_done: "true" } }) },
    { behaviorId: "filter-active", targetId: "original", outcome: failed() },
  ];
  const final = [
    { behaviorId: "add-item", targetId: "nextjs", outcome: outcome({ finalState: { count: "2.0", extra: "ignored" } }) },
    { behaviorId: "edit-item", targetId: "nextjs", outcome: outcome({ finalState: { label: "Walk the cat" } }) },
    { behaviorId: "toggle-all", targetId: "nextjs", outcome: failed() },
    { behaviorId: "filter-active", targetId: "nextjs", outcome: outcome({ finalState: { visible: "1" } }) },
  ];

  it("gives each behavior a verdict and compares only the declared stored keys", () => {
    const report = computeParity(spec, baseline, final, "nextjs");
    expect(report.rows.map((row) => [row.behaviorId, row.verdict])).toEqual([
      ["add-item", "identical"],
      ["edit-item", "diverged"],
      ["toggle-all", "failed-candidate"],
      ["filter-active", "failed-original"],
    ]);
    expect(report.rows[0]?.values).toEqual([{ key: "count", original: "2", candidate: "2.0", equal: true }]);
    expect(report.summary).toEqual({ identical: 1, diverged: 1, failed: 2, total: 4 });
    expect(report.originalTargetId).toBe("original");
    expect(report.candidateTargetId).toBe("nextjs");
  });

  it("marks a behavior the candidate never ran as failed-candidate", () => {
    const report = computeParity(spec, baseline, [], "nextjs");
    expect(report.rows[0]?.verdict).toBe("failed-candidate");
  });
});

describe("list spacing", () => {
  it("treats Kane's comma spacing in joined lists as equal", () => {
    expect(valuesEqual("Buy milk,Walk the dog", "Buy milk, Walk the dog")).toBe(true);
    expect(valuesEqual("Blurred", "Blurred\n×")).toBe(false);
  });
});

describe("json lists", () => {
  it("treats a JSON array Kane returned as the same comma-joined list", () => {
    expect(valuesEqual("Buy milk", '["Buy milk"]')).toBe(true);
    expect(valuesEqual("A, B", '["A","B"]')).toBe(true);
  });
});
