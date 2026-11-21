import { describe, expect, it } from "vitest";
import { behavior, failed } from "../__tests__/fakes.js";
import type { TargetConfig } from "../config.js";
import { buildFeedbackPrompt, feedbackWorthy, renderFeedbackItem, renderSpecMarkdown } from "./prompts.js";

const failure = {
  behavior: behavior("clear-completed", { title: "Clear completed", objective: "Starting fresh, add two items, complete one, clear completed and verify one item remains." }),
  result: {
    behaviorId: "clear-completed",
    targetId: "nextjs",
    outcome: failed({
      reason: "only the first item is visible",
      rca: { rootCause: "[product_bug] Clear completed removes every item", suggestedFix: "Filter on the completed flag only." },
    }),
  },
  failShot: ".theseus-feedback/round-2/clear-completed.png",
};

describe("renderFeedbackItem", () => {
  it("includes objective, failing step, Kane reason, RCA category, root cause, fix and screenshot", () => {
    const text = renderFeedbackItem(failure);
    expect(text).toContain("### Clear completed (`clear-completed`)");
    expect(text).toContain("Objective: Starting fresh, add two items");
    expect(text).toContain("Failed at step 3: verify the counter shows 2 items left");
    expect(text).toContain("Kane: only the first item is visible");
    expect(text).toContain("Root cause (product_bug): Clear completed removes every item");
    expect(text).not.toContain("[product_bug]");
    expect(text).toContain("Suggested fix: Filter on the completed flag only.");
    expect(text).toContain("Screenshot of the failure: .theseus-feedback/round-2/clear-completed.png");
  });

  it("falls back to the bug category when the root cause has no prefix", () => {
    const text = renderFeedbackItem({
      ...failure,
      result: { ...failure.result, outcome: failed({ bug: { category: "Functional", severity: "high", oneLiner: "x" } }) },
    });
    expect(text).toContain("Category: functional");
    expect(text).not.toContain("Suggested fix");
  });

  it("clips very long remarks so one failure cannot flood the prompt", () => {
    const text = renderFeedbackItem({ ...failure, result: { ...failure.result, outcome: failed({ reason: "x".repeat(5000) }) } });
    expect(text.length).toBeLessThan(2500);
    expect(text).toContain("...");
  });
});

describe("buildFeedbackPrompt", () => {
  it("summarizes the round and lists each failure", () => {
    const text = buildFeedbackPrompt({ round: 2, passed: 14, total: 18, failures: [failure] });
    expect(text).toContain("Round 2. Kane CLI ran the behaviors from SPEC.md against your app: 14 of 18 pass.");
    expect(text).toContain("### Clear completed");
    expect(text).toContain("Do not edit SPEC.md");
  });

  it("asks for a build fix first when the app did not start", () => {
    const text = buildFeedbackPrompt({ round: 3, passed: 0, total: 18, failures: [], buildError: "npm run build exited with 1\nType error" });
    expect(text).toContain("The app did not build or start");
    expect(text).toContain("Type error");
  });
});

describe("feedbackWorthy", () => {
  it("drops passes and infrastructure errors", () => {
    const results = [
      failure.result,
      { behaviorId: "a", targetId: "nextjs", outcome: failed({ status: "error", exitCode: 2 }) },
      { behaviorId: "b", targetId: "nextjs", outcome: failed({ status: "passed", exitCode: 0 }) },
    ];
    expect(feedbackWorthy(results).map((r) => r.behaviorId)).toEqual(["clear-completed"]);
  });
});

describe("renderSpecMarkdown", () => {
  it("groups behaviors by area and includes the web start contract", () => {
    const target: TargetConfig = { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js 16 App Router", agent: "claude-code" };
    const spec = {
      version: 1 as const,
      app: { name: "TodoMVC", description: "A todo list.", origin: { id: "original", label: "Original", platform: "web" as const, stack: "jquery", original: true } },
      capturedAt: "2026-11-21T00:00:00.000Z",
      behaviors: [behavior("add-item", { area: "Adding" }), behavior("edit-item", { area: "Editing" }), behavior("add-blank", { area: "Adding" })],
    };
    const md = renderSpecMarkdown(spec, target, ["page-1.png"]);
    expect(md.indexOf("## Adding")).toBeLessThan(md.indexOf("## Editing"));
    expect(md.match(/## Adding/g)).toHaveLength(1);
    expect(md).toContain("npm install && npm run build && npm run start");
    expect(md).toContain("- reference/page-1.png");
    expect(md).toContain("## Behaviors (3)");
  });
});

describe("renderSpecMarkdown with state", () => {
  const spec = {
    version: 1 as const,
    app: { name: "Conduit", description: "A Medium clone.", origin: { id: "original", label: "Original", platform: "web" as const, stack: "AngularJS", original: true } },
    capturedAt: "2026-11-21T00:00:00.000Z",
    behaviors: [behavior("publish", { area: "Editor" })],
  };
  const seedDoc = "# Conduit seed data\n\n| alice | alice@example.com | conduit-demo |\n";
  const state = { method: "POST" as const, resetPath: "/__theseus/reset", seedDoc };
  const web: TargetConfig = { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", agent: "codex" };
  const android: TargetConfig = { id: "expo-android", label: "Expo", platform: "android", stack: "Expo", agent: "codex" };

  it("renders the data and reset contract with the seed verbatim for every target", () => {
    for (const target of [web, android]) {
      const md = renderSpecMarkdown(spec, target, [], state);
      expect(md).toContain("## Data and reset contract");
      expect(md).toContain(seedDoc.trim());
      expect(md).toContain("The app must ship this seed.");
      expect(md).toContain(
        "Implement `POST /__theseus/reset`. It must restore exactly this seed, discarding every change made since, in under 2 seconds, and answer with a 2xx status.",
      );
      expect(md.indexOf("## Data and reset contract")).toBeLessThan(md.indexOf("## Behaviors (1)"));
    }
  });

  it("tells web targets they own their API and storage, and leaves stateless specs unchanged", () => {
    expect(renderSpecMarkdown(spec, web, [], state)).toContain(
      "The app owns its own API and storage: implement every endpoint it needs inside this project, never call the original app's backend or any other server, and keep all persistence local (SQLite or a JSON file in the workspace).",
    );
    const plain = renderSpecMarkdown(spec, web, []);
    expect(plain).not.toContain("Data and reset contract");
    expect(plain).not.toContain("owns its own API");
  });
});
