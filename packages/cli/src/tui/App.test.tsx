import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import { ViewStore } from "./store.js";

const at = (s: number): string => new Date(Date.parse("2026-11-21T10:00:00.000Z") + s * 1000).toISOString();

describe("App", () => {
  it("renders the header, lanes, grid glyphs and the parity summary without color", async () => {
    const store = new ViewStore({
      title: "jQuery TodoMVC, regrown",
      maxRounds: 5,
      behaviors: ["add", "edit", "clear"],
      lanes: [
        { id: "original", label: "Original", stack: "jQuery", isOriginal: true },
        { id: "nextjs", label: "Next.js", stack: "Next.js", isOriginal: false },
      ],
    });
    const { lastFrame, unmount } = render(<App store={store} color={false} />);
    store.push({ type: "phase", at: at(0), phase: "regrow", detail: "nextjs" });
    store.push({ type: "round-start", at: at(1), targetId: "nextjs", round: 2 });
    store.push({ type: "agent-output", at: at(2), targetId: "nextjs", round: 2, text: "edit app/page.tsx" });
    store.push({
      type: "behavior-result",
      at: at(65),
      targetId: "nextjs",
      round: 2,
      result: {
        behaviorId: "add",
        targetId: "nextjs",
        outcome: { status: "passed", exitCode: 0, oneLiner: "", reason: "", durationS: 60, credits: 21, finalState: {}, steps: [], artifacts: {} },
      },
    });
    store.push({
      type: "behavior-result",
      at: at(70),
      targetId: "nextjs",
      round: 2,
      result: {
        behaviorId: "edit",
        targetId: "nextjs",
        outcome: { status: "failed", exitCode: 1, oneLiner: "", reason: "", durationS: 60, credits: 20, finalState: {}, steps: [], artifacts: {} },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const frame = lastFrame() ?? "";
    expect(frame).toContain("THESEUS");
    expect(frame).toContain("jQuery TodoMVC, regrown");
    expect(frame).toContain("01:10");
    expect(frame).toContain("41 credits");
    expect(frame).toContain("round 2/5");
    expect(frame).toContain("■×·");
    expect(frame).toContain("1/3");
    expect(frame).toContain("│ edit app/page.tsx");
    expect(frame).not.toContain("\u001b[");

    store.finish({});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastFrame()).toContain("Parity certificate");
    store.finish({ error: "budget exhausted" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastFrame()).toContain("stopped: budget exhausted");
    unmount();
  });
});
