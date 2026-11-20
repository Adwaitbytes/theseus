import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import { MobileError, type MobileErrorCode } from "./errors.js";
import { type CommandSpec, commandFailed, runChecked, tailLines } from "./exec.js";
import { prepareNativeProject } from "./expo.js";
import { type Context, info, step } from "./system.js";
import type { BuildResult, DeviceInfo } from "./types.js";

const SHORT_MS = 60_000;
export const IOS_DEFAULTS = {
  bootTimeoutMs: 240_000,
  installTimeoutMs: 600_000,
  prebuildTimeoutMs: 300_000,
  podInstallTimeoutMs: 1_200_000,
  buildTimeoutMs: 2_700_000,
  deviceOpTimeoutMs: 120_000,
} as const;

export const SIMULATOR_PRODUCTS = join("ios", "build", "Build", "Products", "Release-iphonesimulator");

const SimctlDevice = z.object({
  udid: z.string(),
  name: z.string(),
  state: z.string(),
  isAvailable: z.boolean().optional(),
});
const SimctlList = z.object({ devices: z.record(z.string(), z.array(SimctlDevice)) });

export interface Simulator {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly osVersion: string;
}

// ---------- parsers ----------

/**
 * `com.apple.CoreSimulator.SimRuntime.iOS-27-2` becomes `27.2`. Device-specific preview runtimes
 * (`iOS-27-2-iPhone19-4`) return undefined: Kane lists their devices without an OS version.
 */
export function runtimeOsVersion(runtimeId: string): string | undefined {
  const match = /SimRuntime\.iOS-(\d+(?:-\d+)*)$/.exec(runtimeId);
  return match?.[1]?.replaceAll("-", ".");
}

/** Available iOS simulators from `xcrun simctl list devices available --json`, newest runtime first. */
export function parseSimctlDevices(json: string): Simulator[] {
  const parsed = SimctlList.parse(JSON.parse(json));
  const sims: Simulator[] = [];
  for (const [runtimeId, devices] of Object.entries(parsed.devices)) {
    const osVersion = runtimeOsVersion(runtimeId);
    if (osVersion === undefined) continue;
    for (const device of devices) {
      if (device.isAvailable === false) continue;
      sims.push({ udid: device.udid, name: device.name, state: device.state, osVersion });
    }
  }
  return sims.sort((a, b) => compareVersions(b.osVersion, a.osVersion));
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Explicit name wins; otherwise a booted iPhone, otherwise the first iPhone on the newest runtime. */
export function chooseSimulator(sims: readonly Simulator[], wanted: string | undefined): Simulator | undefined {
  if (wanted !== undefined) return sims.find((sim) => sim.name === wanted || sim.udid === wanted);
  const iphones = sims.filter((sim) => sim.name.startsWith("iPhone"));
  return iphones.find((sim) => sim.state === "Booted") ?? iphones[0];
}

export function classifyXcodeFailure(log: string): { code: MobileErrorCode; remedy: string } {
  if (/requires a development team|No signing certificate|Code ?Sign(ing)? error|errSecInternalComponent|Provisioning profile/i.test(log)) {
    return {
      code: "signing-failed",
      remedy: "Simulator builds need no team: build with -sdk iphonesimulator and leave CODE_SIGN_IDENTITY at its default (ad hoc). Remove any DEVELOPMENT_TEAM or provisioning settings added to the project.",
    };
  }
  if (/xcode-select: error|requires Xcode|tool 'xcodebuild' requires|SDK "iphonesimulator" cannot be located/i.test(log)) {
    return { code: "xcode-missing", remedy: "Install Xcode 16 or newer and run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" };
  }
  if (/Unable to find a destination|iOS .* is not installed/i.test(log)) {
    return { code: "xcode-missing", remedy: "Install an iOS simulator runtime: xcodebuild -downloadPlatform iOS" };
  }
  return { code: "build-failed", remedy: "Read the log tail for the first `error:` line; fix the app code or native config and rebuild." };
}

// ---------- commands ----------

export function xcodebuildCommand(projectDir: string, workspace: string, scheme: string): CommandSpec {
  return {
    command: "xcodebuild",
    args: [
      "-workspace", join("ios", workspace),
      "-scheme", scheme,
      "-configuration", "Release",
      "-sdk", "iphonesimulator",
      "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", join("ios", "build"),
      // Apple Silicon simulators only; skipping x86_64 halves native compile time.
      "ARCHS=arm64",
      "ONLY_ACTIVE_ARCH=NO",
      "build",
    ],
    cwd: projectDir,
    env: { NODE_ENV: "production" },
  };
}

/** Kane's simulator target takes a `.zip` whose root holds the `.app` bundle. */
export function zipAppCommand(appBundle: string, zipPath: string): CommandSpec {
  return { command: "ditto", args: ["-c", "-k", "--sequesterRsrc", "--keepParent", appBundle, zipPath] };
}

const simctl = (...args: string[]): CommandSpec => ({ command: "xcrun", args: ["simctl", ...args] });

// ---------- device ----------

async function listSimulators(ctx: Context): Promise<Simulator[]> {
  const spec = simctl("list", "devices", "available", "--json");
  const result = await ctx.sys.run(spec, step(ctx, "simctl", SHORT_MS, true)).catch((error: unknown) => {
    if (error instanceof MobileError && error.code === "command-not-found") {
      throw new MobileError("xcode-missing", "xcrun is not available", "Install Xcode 16 or newer from the App Store and launch it once.", { cause: error });
    }
    throw error;
  });
  if (result.exitCode !== 0) {
    throw new MobileError("xcode-missing", "xcrun simctl failed", "Point the developer directory at Xcode: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer", {
      logTail: tailLines(result.stderr),
    });
  }
  return parseSimctlDevices(result.stdout);
}

export interface EnsureIosOptions {
  readonly deviceName: string | undefined;
  readonly headless: boolean;
  readonly bootTimeoutMs: number;
}

/** Boots the chosen simulator unless it is already booted, then waits for `bootstatus`. Idempotent. */
export async function ensureIosDevice(ctx: Context, options: EnsureIosOptions): Promise<DeviceInfo> {
  const sims = await listSimulators(ctx);
  const wanted = options.deviceName ?? ctx.sys.env.THESEUS_SIMULATOR;
  const sim = chooseSimulator(sims, wanted);
  if (sim === undefined) {
    throw new MobileError(
      "no-simulator",
      wanted === undefined ? "no iPhone simulator is available" : `simulator "${wanted}" does not exist`,
      sims.length === 0
        ? "Add a simulator in Xcode > Window > Devices and Simulators, or install a runtime: xcodebuild -downloadPlatform iOS"
        : `Use one of: ${[...new Set(sims.map((s) => s.name))].join(", ")}.`,
    );
  }
  if (sim.state !== "Booted") {
    info(ctx, "simctl", `booting ${sim.name} (iOS ${sim.osVersion})`);
    const boot = simctl("boot", sim.udid);
    const result = await ctx.sys.run(boot, step(ctx, "simctl", SHORT_MS));
    // A concurrent boot between our listing and this call leaves the device Booted, which is what we want.
    if (result.exitCode !== 0 && !/current state: Booted/.test(result.stderr)) {
      throw commandFailed("simctl", boot, result, "Shut the simulator down (xcrun simctl shutdown all) and retry; erase it if it keeps failing.");
    }
  } else {
    info(ctx, "simctl", `${sim.name} already booted`);
  }
  const status = simctl("bootstatus", sim.udid, "-b");
  const waited = await ctx.sys.run(status, step(ctx, "simctl", options.bootTimeoutMs)).catch((error: unknown) => {
    if (error instanceof MobileError && error.code === "timeout") {
      throw new MobileError("device-boot-timeout", `${sim.name} did not finish booting within ${Math.round(options.bootTimeoutMs / 1000)}s`, "Raise bootTimeoutMs, or erase the simulator: xcrun simctl erase <udid>.", { cause: error });
    }
    throw error;
  });
  if (waited.exitCode !== 0) throw commandFailed("simctl", status, waited, "Erase the simulator (xcrun simctl erase <udid>) and retry.");
  if (!options.headless) {
    // The window is only for humans watching; the booted device works without it, so a missing
    // Simulator.app (some Xcode installs ship without it) is reported, not fatal.
    const open: CommandSpec = { command: "open", args: ["-a", "Simulator", "--args", "-CurrentDeviceUDID", sim.udid] };
    const opened = await ctx.sys.run(open, step(ctx, "open", SHORT_MS));
    if (opened.exitCode !== 0) {
      info(ctx, "simctl", `could not open Simulator.app (${opened.stderr.trim()}); ${sim.name} is booted without a window`);
    }
  }
  info(ctx, "simctl", `${sim.name} booted (iOS ${sim.osVersion}, ${sim.udid})`);
  return { deviceName: sim.name, osVersion: sim.osVersion, deviceId: sim.udid };
}

async function resolveUdid(ctx: Context, deviceId: string | undefined): Promise<string> {
  if (deviceId !== undefined) return deviceId;
  const booted = (await listSimulators(ctx)).filter((sim) => sim.state === "Booted");
  const [first, second] = booted;
  if (first === undefined) throw new MobileError("no-device", "no iOS simulator is booted", "Boot one first with ensureDevice('ios').");
  if (second !== undefined) {
    throw new MobileError("no-device", `several simulators are booted (${booted.map((s) => s.name).join(", ")})`, "Pass deviceId to pick one.");
  }
  return first.udid;
}

// ---------- build ----------

export interface BuildIosOptions {
  readonly clean: boolean;
  readonly buildTimeoutMs: number;
}

export async function buildIos(ctx: Context, projectDir: string, options: BuildIosOptions): Promise<BuildResult> {
  const started = ctx.sys.now();
  await prepareNativeProject(ctx, projectDir, "ios", {
    clean: options.clean,
    installTimeoutMs: IOS_DEFAULTS.installTimeoutMs,
    prebuildTimeoutMs: IOS_DEFAULTS.prebuildTimeoutMs,
  });

  const pods: CommandSpec = { command: "pod", args: ["install"], cwd: join(projectDir, "ios"), env: { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" } };
  info(ctx, "pod", "pod install");
  const podResult = await ctx.sys.run(pods, step(ctx, "pod", IOS_DEFAULTS.podInstallTimeoutMs)).catch((error: unknown) => {
    if (error instanceof MobileError && error.code === "command-not-found") {
      throw new MobileError("cocoapods-missing", "CocoaPods (pod) is not installed", "Install it: brew install cocoapods", { cause: error });
    }
    throw error;
  });
  if (podResult.exitCode !== 0) {
    throw new MobileError("cocoapods-missing", `pod install failed with code ${podResult.exitCode}`, "Run `pod repo update` and retry; the log tail has CocoaPods' reason.", {
      logTail: tailLines(`${podResult.stdout}\n${podResult.stderr}`),
    });
  }

  const workspace = ctx.sys.listDir(join(projectDir, "ios")).find((name) => name.endsWith(".xcworkspace"));
  if (workspace === undefined) {
    throw new MobileError("artifact-missing", `pod install produced no .xcworkspace in ${join(projectDir, "ios")}`, "Re-run with clean: true.");
  }
  const scheme = basename(workspace, ".xcworkspace");
  const build = xcodebuildCommand(projectDir, workspace, scheme);
  info(ctx, "xcodebuild", `Release build of ${scheme} for the iOS simulator`);
  const result = await ctx.sys.run(build, step(ctx, "xcodebuild", options.buildTimeoutMs));
  if (result.exitCode !== 0) {
    const log = `${result.stdout}\n${result.stderr}`;
    const { code, remedy } = classifyXcodeFailure(log);
    const errors = log.split("\n").filter((line) => /\berror:/.test(line)).slice(0, 20).join("\n");
    throw new MobileError(code, `xcodebuild failed with code ${result.exitCode}`, remedy, { logTail: errors.length > 0 ? errors : tailLines(log) });
  }

  const productsDir = join(projectDir, SIMULATOR_PRODUCTS);
  const appName = ctx.sys.listDir(productsDir).find((name) => name === `${scheme}.app`) ?? ctx.sys.listDir(productsDir).find((name) => name.endsWith(".app"));
  if (appName === undefined) {
    throw new MobileError("artifact-missing", `xcodebuild succeeded but no .app is in ${productsDir}`, "Check the scheme's product name and the -derivedDataPath.");
  }
  const appBundle = join(productsDir, appName);
  if (!ctx.sys.exists(join(appBundle, "main.jsbundle"))) {
    throw new MobileError(
      "artifact-missing",
      `${appBundle} has no embedded main.jsbundle, so it would need a Metro server`,
      "Build with -configuration Release and keep the 'Bundle React Native code and images' build phase.",
    );
  }
  const appId = await bundleIdentifier(ctx, appBundle);
  const zipPath = join(projectDir, "ios", "build", `${basename(appName, ".app")}.zip`);
  await rm(zipPath, { force: true });
  const zip = zipAppCommand(appBundle, zipPath);
  await runChecked(ctx.sys.run, zip, step(ctx, "ditto", SHORT_MS), (r) => commandFailed("ditto", zip, r, "Check free disk space."));
  info(ctx, "xcodebuild", `built ${zipPath} (${appId})`);
  return { appPath: zipPath, appId, durationMs: ctx.sys.now() - started };
}

async function bundleIdentifier(ctx: Context, appBundle: string): Promise<string> {
  const spec: CommandSpec = { command: "plutil", args: ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(appBundle, "Info.plist")] };
  const result = await runChecked(ctx.sys.run, spec, step(ctx, "plutil", SHORT_MS), (r) => commandFailed("plutil", spec, r, "The .app has no readable Info.plist; rebuild with clean: true."));
  return result.stdout.trim();
}

// ---------- app lifecycle ----------

/** Accepts the `.zip` Kane takes or a bare `.app`; a zip is expanded to a temp directory first. */
export async function installIosApp(ctx: Context, appPath: string, deviceId: string | undefined, timeoutMs: number): Promise<{ appId: string; deviceId: string }> {
  const udid = await resolveUdid(ctx, deviceId);
  let appBundle = appPath;
  let tempDir: string | undefined;
  try {
    if (appPath.endsWith(".zip")) {
      tempDir = await mkdtemp(join(tmpdir(), "theseus-ios-"));
      const unzip: CommandSpec = { command: "ditto", args: ["-x", "-k", appPath, tempDir] };
      await runChecked(ctx.sys.run, unzip, step(ctx, "ditto", SHORT_MS), (r) => commandFailed("ditto", unzip, r, "The zip may be corrupt; rebuild."));
      const app = ctx.sys.listDir(tempDir).find((name) => name.endsWith(".app"));
      if (app === undefined) throw new MobileError("artifact-missing", `${appPath} has no .app at its root`, "Zip the bundle with ditto -c -k --keepParent <App>.app <App>.zip.");
      appBundle = join(tempDir, app);
    }
    const appId = await bundleIdentifier(ctx, appBundle);
    const install = simctl("install", udid, appBundle);
    const result = await ctx.sys.run(install, step(ctx, "simctl", timeoutMs));
    if (result.exitCode !== 0) {
      throw new MobileError("install-failed", `simctl install of ${appPath} on ${udid} failed`, "Check the build targets the simulator SDK (not iphoneos) and arm64.", {
        logTail: tailLines(`${result.stdout}\n${result.stderr}`),
      });
    }
    info(ctx, "simctl", `installed ${appId} on ${udid}`);
    return { appId, deviceId: udid };
  } finally {
    if (tempDir !== undefined) await rm(tempDir, { recursive: true, force: true });
  }
}

/** Idempotent: uninstalling an app that is not installed succeeds. */
export async function uninstallIosApp(ctx: Context, appId: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const udid = await resolveUdid(ctx, deviceId);
  const spec = simctl("uninstall", udid, appId);
  const result = await ctx.sys.run(spec, step(ctx, "simctl", timeoutMs));
  if (result.exitCode !== 0 && !/not installed|No such file/i.test(result.stderr)) {
    throw commandFailed("simctl", spec, result, "Erase the simulator (xcrun simctl erase <udid>) if the app cannot be removed.");
  }
}

export async function launchIosApp(ctx: Context, appId: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const udid = await resolveUdid(ctx, deviceId);
  const spec = simctl("launch", udid, appId);
  const result = await ctx.sys.run(spec, step(ctx, "simctl", timeoutMs));
  if (result.exitCode !== 0) {
    throw new MobileError("launch-failed", `could not launch ${appId} on ${udid}`, "Check the app is installed on this simulator.", { logTail: tailLines(result.stderr) });
  }
}

export async function screenshotIos(ctx: Context, outPath: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const udid = await resolveUdid(ctx, deviceId);
  const spec = simctl("io", udid, "screenshot", outPath);
  await runChecked(ctx.sys.run, spec, step(ctx, "simctl", timeoutMs), (r) => commandFailed("simctl", spec, r, "Check the simulator is booted."));
}
