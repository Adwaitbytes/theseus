import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Target } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { FakeKaneClient, behavior, outcome } from "../__tests__/fakes.js";
import { TheseusError } from "../errors.js";
import { EventBus } from "../events/bus.js";
import { stateResetter, type HttpFetch } from "../state.js";
import { CreditLedger } from "./budget.js";
import { runBehaviorSet, type KaneRunContext } from "./run.js";

const original: Target = { id: "original", label: "Original", platform: "web", stack: "AngularJS", url: "http://localhost:4171", original: true };
const state = { resetUrl: "/__theseus/reset", method: "POST" as const, seedDoc: "SEED.md" };

async function context(kane: FakeKaneClient, fetch: HttpFetch): Promise<KaneRunContext> {
  const root = await mkdtemp(join(tmpdir(), "theseus-run-"));
  return {
    kane,
    bus: new EventBus(),
    ledger: new CreditLedger({ perRunEstimate: 21 }),
    voyageDir: root,
    kaneCwd: join(root, ".kane"),
    timeoutS: 60,
    resetState: stateResetter(state, { fetch, retryDelayMs: 0 }),
  };
}

describe("runBehaviorSet with state", () => {
  it("resets the target right before every Kane run, one run at a time", async () => {
    const log: string[] = [];
    const kane = new FakeKaneClient((b) => {
      log.push(`kane ${b.id}`);
      return outcome();
    });
    const fetch: HttpFetch = (url, init) => {
      log.push(`${init.method} ${url}`);
      return Promise.resolve({ status: 200, text: () => Promise.resolve("") });
    };
    const behaviors = [behavior("publish"), behavior("comment"), behavior("follow")];
    const results = await runBehaviorSet(await context(kane, fetch), behaviors, original, { round: 0, concurrency: 1, artifactsPath: "original/baseline" });
    expect(results.map((result) => result.outcome.status)).toEqual(["passed", "passed", "passed"]);
    expect(log).toEqual([
      "POST http://localhost:4171/__theseus/reset",
      "kane publish",
      "POST http://localhost:4171/__theseus/reset",
      "kane comment",
      "POST http://localhost:4171/__theseus/reset",
      "kane follow",
    ]);
  });

  it("never runs Kane on unreset state: a failed reset stops the batch with a typed error", async () => {
    const kane = new FakeKaneClient();
    const fetch: HttpFetch = () => Promise.resolve({ status: 503, text: () => Promise.resolve("backend restarting") });
    const error = await runBehaviorSet(await context(kane, fetch), [behavior("publish")], original, {
      round: 0,
      concurrency: 1,
      artifactsPath: "original/baseline",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TheseusError);
    expect((error as TheseusError).code).toBe("state-reset-failed");
    expect((error as TheseusError).message).toContain("HTTP 503: backend restarting");
    expect(kane.calls).toHaveLength(0);
  });
});
