import { describe, expect, it } from "vitest";
import { TheseusError } from "./errors.js";
import { parseSeedDoc, resetState, resetUrlFor, stateResetter, type HttpFetch } from "./state.js";

const state = { resetUrl: "/__theseus/reset", method: "POST" as const, seedDoc: "SEED.md" };

/** A fake HTTP endpoint that answers from a queue and records every request. */
function fakeHttp(answers: readonly (number | Error)[]): { fetch: HttpFetch; requests: { url: string; method: string }[] } {
  const requests: { url: string; method: string }[] = [];
  let next = 0;
  const fetch: HttpFetch = (url, init) => {
    requests.push({ url, method: init.method });
    const answer = answers[Math.min(next, answers.length - 1)];
    next += 1;
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ status: answer ?? 500, text: () => Promise.resolve(answer === 500 ? "boom" : "") });
  };
  return { fetch, requests };
}

describe("resetUrlFor", () => {
  it("resolves the reset path against the target's origin", () => {
    expect(resetUrlFor("http://127.0.0.1:3999/", "/__theseus/reset")).toBe("http://127.0.0.1:3999/__theseus/reset");
    expect(resetUrlFor("http://localhost:4171", "/__theseus/reset")).toBe("http://localhost:4171/__theseus/reset");
  });
});

describe("resetState", () => {
  it("posts once and returns on a 2xx", async () => {
    const http = fakeHttp([204]);
    await resetState("http://localhost:4171", state, { fetch: http.fetch, retryDelayMs: 0 });
    expect(http.requests).toEqual([{ url: "http://localhost:4171/__theseus/reset", method: "POST" }]);
  });

  it("retries once after a failure", async () => {
    const http = fakeHttp([new Error("ECONNREFUSED"), 200]);
    await resetState("http://localhost:4171", state, { fetch: http.fetch, retryDelayMs: 0 });
    expect(http.requests).toHaveLength(2);
  });

  it("raises a typed error with a remedy after two failed attempts", async () => {
    const http = fakeHttp([500, 404]);
    const error = await resetState("http://localhost:4171", state, { fetch: http.fetch, retryDelayMs: 0 }).catch((caught: unknown) => caught);
    expect(http.requests).toHaveLength(2);
    expect(error).toBeInstanceOf(TheseusError);
    expect((error as TheseusError).code).toBe("state-reset-failed");
    expect((error as TheseusError).message).toContain("POST http://localhost:4171/__theseus/reset did not restore the seed after 2 attempts (HTTP 404)");
    expect((error as TheseusError).message).toContain("POST /__theseus/reset restores the seed and answers 2xx");
  });

  it("stops at once when the voyage is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const http = fakeHttp([200]);
    await expect(resetState("http://localhost:4171", state, { fetch: http.fetch, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(http.requests).toHaveLength(0);
  });
});

describe("stateResetter", () => {
  it("resets web targets at their own URL and leaves mobile targets alone", async () => {
    const http = fakeHttp([200]);
    const reset = stateResetter(state, { fetch: http.fetch });
    await reset({ id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js", url: "http://127.0.0.1:3999/", original: false });
    await reset({ id: "expo", label: "Expo", platform: "android", stack: "Expo", original: false });
    expect(http.requests.map((request) => request.url)).toEqual(["http://127.0.0.1:3999/__theseus/reset"]);
  });

  it("refuses a web target without a URL", async () => {
    const reset = stateResetter(state, { fetch: fakeHttp([200]).fetch });
    await expect(reset({ id: "web", label: "Web", platform: "web", stack: "x", original: false })).rejects.toMatchObject({ code: "phase-precondition" });
  });
});

describe("parseSeedDoc", () => {
  it("collects each account email once, lowercased", () => {
    const seed = parseSeedDoc("| alice | Alice@Example.com |\n| bob | bob@example.com |\nalice@example.com again");
    expect(seed.emails).toEqual(["alice@example.com", "bob@example.com"]);
  });
});
