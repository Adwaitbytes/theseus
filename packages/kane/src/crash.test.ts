import { describe, expect, it } from "vitest";
import { isRetryableInfraFailure, type KaneProcessResult } from "./process.js";
import { outcomeStatus } from "./outcome.js";

const crashedRunEnd = JSON.stringify({
  type: "run_end",
  status: "failed",
  reason: "Screenshot failed: TargetClosedError: screenshot: Target page, context or browser has been closed",
  v: 1,
});

function result(overrides: Partial<KaneProcessResult>): KaneProcessResult {
  return { exitCode: 1, killSignal: null, timedOut: false, events: [], stdout: "", stderr: "", durationMs: 1, ...overrides };
}

describe("browser crashes", () => {
  it("retries a failed run whose output shows Kane's browser closed", () => {
    expect(isRetryableInfraFailure(result({ stdout: crashedRunEnd }))).toBe(true);
  });

  it("reports a persistent browser crash as an error, not a failed behavior", () => {
    expect(outcomeStatus(result({ stdout: crashedRunEnd }))).toBe("error");
  });

  it("keeps a genuine assertion failure as failed and not retryable", () => {
    const failure = JSON.stringify({ type: "run_end", status: "failed", reason: "The footer shows 2 items left, not 3.", v: 1 });
    expect(isRetryableInfraFailure(result({ stdout: failure }))).toBe(false);
    expect(outcomeStatus(result({ stdout: failure }))).toBe("failed");
  });
});
