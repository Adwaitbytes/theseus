import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordedPasses } from "./resume.js";

const outcome = (status: string) => ({
  status, exitCode: status === "passed" ? 0 : 1, oneLiner: "x", reason: "x", durationS: 1, credits: 20,
  finalState: {}, steps: [], artifacts: {},
});
const result = (behaviorId: string, status: string, round = 0, targetId = "original") =>
  JSON.stringify({ type: "behavior-result", at: "2026-11-21T00:00:00.000Z", targetId, round, result: { behaviorId, targetId, outcome: outcome(status) } });

describe("recordedPasses", () => {
  it("reuses only the latest passing result per behavior for the given target and round", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-resume-"));
    const file = join(dir, "events.ndjson");
    await writeFile(file, [
      result("add-one", "passed"),
      result("edit", "failed"),
      result("flaky", "passed"),
      result("flaky", "failed"),
      result("other-round", "passed", 1),
      result("other-target", "passed", 0, "nextjs"),
      "",
    ].join("\n"));
    const passes = await recordedPasses(file, "original", 0);
    expect([...passes.keys()]).toEqual(["add-one"]);
  });

  it("returns nothing when no log exists yet", async () => {
    expect((await recordedPasses("/nonexistent/events.ndjson", "original", 0)).size).toBe(0);
  });
});
