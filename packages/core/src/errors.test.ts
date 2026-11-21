import { describe, expect, it } from "vitest";
import { errorDetail } from "./errors.js";

describe("errorDetail", () => {
  it("includes the remedy and log tail a native build error carries", () => {
    const error = Object.assign(new Error("Gradle assembleRelease failed with code 1"), {
      remedy: "Fix the Gradle error above",
      logTail: "Execution failed for task ':app:mergeReleaseResources'.",
    });
    const text = errorDetail(error);
    expect(text).toContain("Gradle assembleRelease failed");
    expect(text).toContain("Remedy: Fix the Gradle error above");
    expect(text).toContain(":app:mergeReleaseResources");
  });

  it("falls back to the plain message", () => {
    expect(errorDetail(new Error("boom"))).toBe("boom");
  });
});
