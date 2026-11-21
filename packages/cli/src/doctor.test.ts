import { KaneSpawnError, NotLoggedInError } from "@theseus/kane";
import { describe, expect, it } from "vitest";
import { checkAndroid, checkIos, checkKane, checkNode, doctor, renderChecks, requireOneAgent, runDoctor, type CommandOutcome, type DoctorProbes } from "./doctor.js";
import { colorizer } from "./output.js";

type Responses = Record<string, CommandOutcome>;
const ran = (stdout: string, exitCode = 0): CommandOutcome => ({ kind: "ran", exitCode, stdout, stderr: "" });

function probes(responses: Responses, overrides: Partial<DoctorProbes> = {}): DoctorProbes {
  return {
    nodeVersion: "24.1.0",
    platform: "darwin",
    env: {},
    homeDir: "/home/me",
    kane: { version: () => Promise.resolve("0.10.7"), balance: () => Promise.resolve(5000) },
    run: (command, args) => Promise.resolve(responses[[command, ...args].join(" ")] ?? { kind: "missing" }),
    exists: (path) => path === "/sdk/platform-tools/adb",
    mobileInstalled: () => Promise.resolve(true),
    ...overrides,
  };
}

const READY: Responses = {
  "codex --version": ran("codex-cli 0.80.0\n"),
  "codex login status": ran("Logged in using ChatGPT\n"),
  "claude --version": ran("2.1.0 (Claude Code)\n"),
  "claude auth status": ran('{"loggedIn": true}'),
  "/sdk/platform-tools/adb devices": ran("List of devices attached\nemulator-5554\tdevice\n"),
  "xcrun simctl list devices available --json": ran(JSON.stringify({ devices: { "iOS-18": [{ name: "iPhone 16", state: "Shutdown" }] } })),
};

describe("doctor checks", () => {
  it("passes on a ready machine", async () => {
    const checks = await runDoctor(probes(READY, { env: { ANDROID_HOME: "/sdk" } }));
    expect(checks.map((check) => [check.name, check.status, check.detail])).toEqual([
      ["Node.js", "ok", "v24.1.0"],
      ["Kane CLI", "ok", "0.10.7"],
      ["Kane sign-in", "ok", "5,000 credits"],
      ["Codex", "ok", "codex-cli 0.80.0, logged in using chatgpt"],
      ["Claude Code", "ok", "2.1.0 (Claude Code), signed in"],
      ["Android emulator", "ok", "emulator-5554 is running"],
      ["iOS simulator", "ok", "iPhone 16 ready, booted on demand"],
    ]);
  });

  it("flags old Node, missing Kane and a signed-out Kane with remedies", async () => {
    expect(checkNode("20.11.0")).toMatchObject({ status: "fail", remedy: expect.stringContaining("Node.js 22") });
    const missing = await checkKane({ version: () => Promise.reject(new KaneSpawnError("spawn kane-cli ENOENT")), balance: () => Promise.resolve(0) });
    expect(missing.map((check) => check.status)).toEqual(["fail", "skip"]);
    expect(missing[0]?.remedy).toBe("npm install -g @testmuai/kane-cli");
    const signedOut = await checkKane({ version: () => Promise.resolve("0.10.7"), balance: () => Promise.reject(new NotLoggedInError("no")) });
    expect(signedOut[1]).toMatchObject({ status: "fail", remedy: "kane-cli login" });
    const low = await checkKane({ version: () => Promise.resolve("0.10.7"), balance: () => Promise.resolve(120) });
    expect(low[1]?.status).toBe("warn");
  });

  it("needs at least one builder agent", async () => {
    const checks = await runDoctor(probes({ "codex --version": ran("codex-cli 0.80.0"), "codex login status": ran("Not logged in", 1) }, { mobileInstalled: () => Promise.resolve(false) }));
    expect(checks.find((check) => check.name === "Codex")).toMatchObject({ status: "fail", remedy: "codex login" });
    expect(checks.find((check) => check.name === "Claude Code")?.status).toBe("fail");
    expect(checks.at(-1)).toMatchObject({ name: "Mobile targets", status: "skip" });
    expect(requireOneAgent([{ name: "Codex", status: "ok", detail: "x" }, { name: "Claude Code", status: "warn", detail: "y" }])[1]?.status).toBe("warn");
  });

  it("finds an AVD to boot, or explains how to make one", async () => {
    const withAvd = probes({ "/sdk/platform-tools/adb devices": ran("List of devices attached\n"), "/sdk/emulator/emulator -list-avds": ran("INFO | x\nPixel_7_API_34\n") }, { env: { ANDROID_HOME: "/sdk" } });
    expect(await checkAndroid(withAvd)).toMatchObject({ status: "ok", detail: "Pixel_7_API_34 ready, booted on demand" });
    expect(await checkAndroid(probes({}, { exists: () => false }))).toMatchObject({ status: "fail", detail: "no Android SDK found" });
  });

  it("skips iOS off macOS and reports a missing Xcode", async () => {
    expect(await checkIos(probes({}, { platform: "linux" }))).toMatchObject({ status: "skip" });
    expect(await checkIos(probes({}))).toMatchObject({ status: "fail", detail: "Xcode command line tools not found" });
  });
});

describe("doctor output", () => {
  it("prints a checklist with remedies and exits 1 on a failure", async () => {
    let text = "";
    const code = await doctor({}, probes({}, { mobileInstalled: () => Promise.resolve(false) }), (chunk) => (text += chunk), colorizer(false));
    expect(code).toBe(1);
    expect(text).toContain("Theseus doctor");
    expect(text).toMatch(/fail {2}Codex {15}not installed; no builder agent is ready/);
    expect(text).toContain("npm install -g @openai/codex");
    expect(text).toContain("2 problems to fix before a voyage.");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("says ready when everything passes", () => {
    expect(renderChecks([{ name: "Node.js", status: "ok", detail: "v24" }], colorizer(false))).toContain("Ready for a voyage.");
  });
});
