import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Behavior, KaneOutcome, Target } from "@theseus/schema";
import { describe, expect, it } from "vitest";
import { FAKE_KANE, fixture, scenarioEnv, tempDir, type FakeScenario } from "./__fixtures__/helpers.js";
import { createKaneClient, parseBalance } from "./client.js";
import type { KaneStepEvent } from "./contract.js";
import { KaneCommandError, KaneTargetError, NotLoggedInError } from "./errors.js";

const behavior = Behavior.parse({
  id: "footer-counter",
  title: "Footer counter after adding two todos",
  area: "todos",
  objective: "Add two todos: 'Alpha' and 'Beta'. Verify the footer counter says exactly '3 items left'. Store the footer counter text as 'items_left'.",
  stores: ["items_left", "todo_titles"],
  tags: ["Smoke", "counter"],
  source: "capture",
});
const web = Target.parse({ id: "original", label: "Original", platform: "web", stack: "jquery", url: "http://localhost:4170" });
const android = Target.parse({ id: "expo-android", label: "Expo", platform: "android", stack: "expo", app: "builds/app.apk" });
const ios = Target.parse({ id: "expo-ios", label: "Expo", platform: "ios", stack: "expo", app: "APP1234567" });

function client(dir: string, scenario: FakeScenario) {
  return createKaneClient({
    bin: FAKE_KANE,
    env: scenarioEnv(dir, scenario),
    retry: { attempts: 3, baseDelayMs: 10 },
    devices: { android: { name: "Pixel 7", osVersion: "14" } },
  });
}

describe("runBehavior", () => {
  it("runs a web behavior end to end on the recorded failure stream", async () => {
    const dir = tempDir();
    const pack = path.join(dir, "kane-home", "fail.evidence");
    mkdirSync(path.dirname(pack), { recursive: true });
    copyFileSync(fixture("real/fail.evidence"), pack);
    const argsFile = path.join(dir, "args.json");
    const steps: KaneStepEvent[] = [];
    const voyage = path.join(dir, "voyage");

    const outcome = await client(dir, {
      stdoutFile: fixture("real/fail.ndjson"),
      stderr: `Running on: Desktop · Chrome\nevidence: view locally with \`kane-cli evidence serve ${pack}\`\n`,
      exitCode: 1,
      argsFile,
    }).runBehavior(behavior, web, {
      cwd: dir,
      artifactsDir: path.join(voyage, "artifacts", "original"),
      artifactsRoot: voyage,
      maxSteps: 30,
      bugDetection: "continue",
      timeoutS: 120,
      onStep: (event) => steps.push(event),
    });

    expect(KaneOutcome.parse(outcome)).toEqual(outcome);
    expect(outcome.status).toBe("failed");
    expect(outcome.exitCode).toBe(1);
    expect(outcome.failingStep?.index).toBe(7);
    expect(outcome.rca?.rootCause).toMatch(/^\[automation_bug\] /);
    expect(outcome.artifacts).toEqual({
      finalShot: "artifacts/original/footer-counter-final.jpg",
      failShot: "artifacts/original/footer-counter-fail.jpg",
      evidencePack: pack,
    });
    expect(outcome.reason).toContain("Missing stored values: items_left, todo_titles.");
    expect(steps.at(-1)).toEqual({ step: 7, status: "failed", remark: "wait: Waiting after verifying the footer counter" });

    const recorded = JSON.parse(readFileSync(argsFile, "utf8"));
    expect(recorded.env.KANE_CLI_USER_AGENT).toBe("theseus");
    expect(recorded.args).toEqual([
      "run",
      `${behavior.objective}\nStore the todo titles as 'todo_titles'.`,
      "--agent",
      "--mode",
      "testing",
      "--target",
      "desktop",
      "--url",
      "http://localhost:4170",
      "--headless",
      "--timeout",
      "120",
      "--max-steps",
      "30",
      "--bug-detection",
      "continue",
    ]);
  });

  it("builds emulator and simulator commands without --headless", async () => {
    const dir = tempDir();
    const argsFile = path.join(dir, "args.json");
    const run = (target: Target) =>
      client(dir, { stdoutFile: fixture("synthetic/pass.ndjson"), exitCode: 0, argsFile }).runBehavior(behavior, target, {
        cwd: dir,
        artifactsDir: path.join(dir, "artifacts"),
        artifactsRoot: dir,
      });

    await run(android);
    const androidArgs: string[] = JSON.parse(readFileSync(argsFile, "utf8")).args;
    expect(androidArgs.slice(2)).toEqual([
      "--agent",
      "--mode",
      "testing",
      "--target",
      "emulator",
      "--app",
      path.resolve("builds/app.apk"),
      "--device-name",
      "Pixel 7",
      "--os-version",
      "14",
      "--timeout",
      "600",
    ]);

    const outcome = await run(ios);
    const iosArgs: string[] = JSON.parse(readFileSync(argsFile, "utf8")).args;
    expect(iosArgs.slice(2)).toEqual(["--agent", "--mode", "testing", "--target", "simulator", "--app", "APP1234567", "--timeout", "600"]);
    expect(outcome.status).toBe("passed");
    expect(outcome.reason).toContain("Evidence pack not found");
  });

  it("returns an error outcome after retrying infrastructure failures", async () => {
    const dir = tempDir();
    const outcome = await client(dir, { counterFile: path.join(dir, "count"), infraFailures: 9 }).runBehavior(behavior, web, {
      cwd: dir,
      artifactsDir: path.join(dir, "artifacts"),
      artifactsRoot: dir,
    });
    expect(outcome.status).toBe("error");
    expect(outcome.reason).toMatch(/^Infrastructure error after 3 attempts: Chrome failed to launch/);
    expect(readFileSync(path.join(dir, "count"), "utf8")).toBe("3");
  });

  it("rejects a target that lacks what its platform needs", async () => {
    const dir = tempDir();
    const noUrl = Target.parse({ id: "web-x", label: "x", platform: "web", stack: "next" });
    await expect(
      client(dir, {}).runBehavior(behavior, noUrl, { cwd: dir, artifactsDir: dir, artifactsRoot: dir }),
    ).rejects.toBeInstanceOf(KaneTargetError);
  });
});

describe("version and balance", () => {
  it("reads the version", async () => {
    const dir = tempDir();
    expect(await client(dir, { stdout: "0.10.7\n" }).version()).toBe("0.10.7");
  });

  it("parses the balance line kane-cli 0.10.7 prints", async () => {
    const dir = tempDir();
    expect(await client(dir, { stdout: "Available credits: 1234.5\n" }).balance()).toBe(1234.5);
    expect(parseBalance("\u001b[1mAvailable credits:\u001b[0m 1,250")).toBe(1250);
    expect(parseBalance("nothing")).toBeUndefined();
  });

  it("throws NotLoggedInError when kane-cli is not signed in", async () => {
    const dir = tempDir();
    const notLoggedIn = client(dir, { exitCode: 2, stderr: 'Not authenticated [prod]. Run "kane-cli login" first.\n' });
    await expect(notLoggedIn.balance()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("throws KaneCommandError on unreadable balance output", async () => {
    const dir = tempDir();
    await expect(client(dir, { exitCode: 1, stderr: "Error: network down\n" }).balance()).rejects.toBeInstanceOf(
      KaneCommandError,
    );
  });
});

describe("exportTestMd", () => {
  it("writes one _test.md per behavior for web and mobile targets", async () => {
    const dir = tempDir();
    const kane = client(dir, {});
    const [webFile] = await kane.exportTestMd([behavior], web, path.join(dir, "web"));
    expect(webFile).toBe(path.join(dir, "web", "footer-counter_test.md"));
    expect(readFileSync(webFile ?? "", "utf8")).toBe(
      [
        "---",
        "mode: testing",
        'url: "http://localhost:4170"',
        'tags: ["smoke", "counter"]',
        "---",
        "",
        "# Footer counter after adding two todos",
        "",
        "## Footer counter after adding two todos",
        behavior.objective,
        "Store the todo titles as 'todo_titles'.",
        "",
      ].join("\n"),
    );
    const [androidFile] = await kane.exportTestMd([behavior], android, path.join(dir, "android"));
    const androidText = readFileSync(androidFile ?? "", "utf8");
    expect(androidText).toContain('target: emulator\napp: "builds/app.apk"\n');
    expect(androidText).not.toContain("url:");
  });
});
