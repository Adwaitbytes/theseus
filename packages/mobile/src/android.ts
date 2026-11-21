import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MobileError, type MobileErrorCode } from "./errors.js";
import { type CommandSpec, commandFailed, runChecked, failureExcerpt, tailLines } from "./exec.js";
import { prepareNativeProject } from "./expo.js";
import { type Context, info, step } from "./system.js";
import { type AndroidSdk, resolveAndroidSdk, resolveJavaHome } from "./toolchain.js";
import type { BuildResult, DeviceInfo } from "./types.js";

const POLL_MS = 2_000;
const SHORT_MS = 30_000;
export const ANDROID_DEFAULTS = {
  bootTimeoutMs: 240_000,
  installTimeoutMs: 600_000,
  prebuildTimeoutMs: 300_000,
  buildTimeoutMs: 1_800_000,
  deviceOpTimeoutMs: 120_000,
  abis: ["arm64-v8a"],
} as const;

export const RELEASE_APK = join("android", "app", "build", "outputs", "apk", "release", "app-release.apk");

export interface AdbDevice {
  readonly serial: string;
  readonly state: string;
}

// ---------- parsers ----------

/** `emulator -list-avds` prints AVD names, one per line, sometimes interleaved with `INFO |` diagnostics. */
export function parseAvdList(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes("|") && !/^(INFO|WARNING|ERROR)\b/.test(line));
}

export function parseAdbDevices(stdout: string): AdbDevice[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of devices") && !line.startsWith("*"))
    .map((line) => line.split(/\s+/))
    .filter((parts): parts is [string, string, ...string[]] => parts.length >= 2)
    .map(([serial, state]) => ({ serial, state }));
}

/** `adb -s <serial> emu avd name` prints the AVD name followed by `OK`. */
export function parseEmuAvdName(stdout: string): string | undefined {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "OK");
}

export function parseBadgingPackage(stdout: string): string | undefined {
  return /package: name='([^']+)'/.exec(stdout)?.[1];
}

/** A release APK must embed the JS bundle; without it the app would wait for a Metro server that never comes. */
export function listingHasJsBundle(unzipListing: string): boolean {
  return /\sassets\/index\.android\.bundle\s*$/m.test(unzipListing);
}

export function classifyGradleFailure(log: string): { code: MobileErrorCode; remedy: string } {
  if (/SDK location not found|ANDROID_HOME|sdk\.dir/.test(log)) {
    return { code: "android-sdk-missing", remedy: "Set ANDROID_HOME to the Android SDK root, or write sdk.dir to android/local.properties." };
  }
  if (/licen[cs]es? for .* (have|has) not been accepted|Failed to install the following Android SDK packages/i.test(log)) {
    return { code: "android-sdk-missing", remedy: "Accept the SDK licenses: sdkmanager --licenses (Gradle installs missing SDK packages after that)." };
  }
  if (/Unsupported class file major version|JAVA_HOME is set to an invalid|requires Java \d+|Could not determine java version|incompatible.*Java/i.test(log)) {
    return { code: "java-missing", remedy: "Build with JDK 17: brew install openjdk@17, or set THESEUS_JAVA_HOME." };
  }
  if (/keystore|signingConfig|Failed to read key|SigningConfig/i.test(log)) {
    return {
      code: "signing-failed",
      remedy: "Release builds are signed with the debug keystore; make sure android/app/debug.keystore exists (re-run with clean: true to regenerate it).",
    };
  }
  return { code: "build-failed", remedy: "Read the log tail for the first Gradle error; fix the app code or native config and rebuild." };
}

// ---------- commands ----------

export function gradleAssembleCommand(projectDir: string, abis: readonly string[], javaHome: string, sdk: AndroidSdk): CommandSpec {
  return {
    command: "./gradlew",
    args: ["assembleRelease", `-PreactNativeArchitectures=${abis.join(",")}`, "--console=plain"],
    cwd: join(projectDir, "android"),
    env: { JAVA_HOME: javaHome, ANDROID_HOME: sdk.root, ANDROID_SDK_ROOT: sdk.root, NODE_ENV: "production" },
  };
}

export function emulatorLaunchCommand(sdk: AndroidSdk, avd: string, headless: boolean): CommandSpec {
  return {
    command: sdk.emulator,
    args: ["-avd", avd, "-no-boot-anim", "-no-snapshot-save", "-netdelay", "none", "-netspeed", "full", ...(headless ? ["-no-window"] : [])],
  };
}

const adb = (sdk: AndroidSdk, serial: string | undefined, ...args: string[]): CommandSpec => ({
  command: sdk.adb,
  args: serial === undefined ? args : ["-s", serial, ...args],
});

// ---------- device ----------

async function adbOutput(ctx: Context, spec: CommandSpec, timeoutMs = SHORT_MS): Promise<string> {
  const result = await runChecked(ctx.sys.run, spec, step(ctx, "adb", timeoutMs), (r) =>
    commandFailed("adb", spec, r, "Restart adb (adb kill-server) and check the emulator is responsive."),
  );
  return result.stdout;
}

async function runningEmulators(ctx: Context, sdk: AndroidSdk): Promise<Array<AdbDevice & { avd: string | undefined }>> {
  const devices = parseAdbDevices(await adbOutput(ctx, adb(sdk, undefined, "devices"))).filter((d) => d.serial.startsWith("emulator-"));
  return Promise.all(
    devices.map(async (device) => {
      const result = await ctx.sys.run(adb(sdk, device.serial, "emu", "avd", "name"), step(ctx, "adb", SHORT_MS));
      return { ...device, avd: result.exitCode === 0 ? parseEmuAvdName(result.stdout) : undefined };
    }),
  );
}

async function shellProp(ctx: Context, sdk: AndroidSdk, serial: string, prop: string): Promise<string> {
  const result = await ctx.sys.run(adb(sdk, serial, "shell", "getprop", prop), step(ctx, "adb", SHORT_MS));
  return result.exitCode === 0 ? result.stdout.trim() : "";
}

export interface EnsureAndroidOptions {
  readonly avd: string | undefined;
  readonly headless: boolean;
  readonly bootTimeoutMs: number;
}

/** Boots the requested AVD unless it is already running, then waits for `sys.boot_completed`. Idempotent. */
export async function ensureAndroidDevice(ctx: Context, options: EnsureAndroidOptions): Promise<DeviceInfo> {
  const sdk = resolveAndroidSdk(ctx.sys);
  if (!ctx.sys.exists(sdk.emulator)) {
    throw new MobileError("android-sdk-missing", `the emulator binary is missing at ${sdk.emulator}`, 'Install it: sdkmanager "emulator".');
  }
  const listSpec: CommandSpec = { command: sdk.emulator, args: ["-list-avds"] };
  const avds = parseAvdList(
    (
      await runChecked(ctx.sys.run, listSpec, step(ctx, "emulator", SHORT_MS), (r) =>
        commandFailed("emulator", listSpec, r, "Run the emulator binary by hand to see why it cannot list AVDs."),
      )
    ).stdout,
  );
  if (avds.length === 0) {
    throw new MobileError(
      "no-avd",
      "no Android Virtual Device exists",
      'Create one from an arm64-v8a image: sdkmanager "system-images;android-35;google_apis;arm64-v8a" && avdmanager create avd -n theseus_pixel -k "system-images;android-35;google_apis;arm64-v8a" -d pixel',
    );
  }
  const running = await runningEmulators(ctx, sdk);
  const missingImage = (avd: string) => avdMissingImage(ctx, sdk, avd);
  const explicit = options.avd ?? ctx.sys.env.THESEUS_AVD;
  const wanted =
    explicit ?? running.find((d) => d.avd !== undefined)?.avd ?? avds.find((avd) => missingImage(avd) === undefined) ?? avds[0];
  if (wanted === undefined || !avds.includes(wanted)) {
    throw new MobileError("no-avd", `AVD "${wanted ?? ""}" does not exist`, `Use one of: ${avds.join(", ")}.`);
  }

  const deadline = ctx.sys.now() + options.bootTimeoutMs;
  let serial = running.find((d) => d.avd === wanted)?.serial;
  if (serial === undefined) {
    const image = missingImage(wanted);
    if (image !== undefined) {
      throw new MobileError(
        "no-avd",
        `AVD ${wanted} points at a system image that is not installed (${image})`,
        `Install it (sdkmanager "${image.replace(/\/$/, "").replaceAll("/", ";")}") or pick another AVD: ${avds.filter((a) => a !== wanted).join(", ") || "none"}.`,
      );
    }
    const logFile = join(tmpdir(), `theseus-emulator-${wanted}.log`);
    info(ctx, "emulator", `booting AVD ${wanted} (log: ${logFile})`);
    await ctx.sys.spawnDetached(emulatorLaunchCommand(sdk, wanted, options.headless), logFile);
    while (serial === undefined) {
      const fatal = /^(FATAL|PANIC).*$/m.exec(ctx.sys.readText(logFile) ?? "");
      if (fatal !== null) {
        throw new MobileError("device-boot-timeout", `the emulator exited while booting ${wanted}: ${fatal[0]}`, "Fix the AVD named in the error, or pick another AVD.", {
          logTail: tailLines(ctx.sys.readText(logFile) ?? ""),
        });
      }
      if (ctx.sys.now() > deadline) throw bootTimeout(wanted, options.bootTimeoutMs);
      await ctx.sys.sleep(POLL_MS);
      serial = (await runningEmulators(ctx, sdk)).find((d) => d.avd === wanted)?.serial;
    }
  } else {
    info(ctx, "emulator", `AVD ${wanted} already running as ${serial}`);
  }

  while ((await shellProp(ctx, sdk, serial, "sys.boot_completed")) !== "1") {
    if (ctx.sys.now() > deadline) throw bootTimeout(wanted, options.bootTimeoutMs);
    await ctx.sys.sleep(POLL_MS);
  }
  const osVersion = await shellProp(ctx, sdk, serial, "ro.build.version.release");
  info(ctx, "emulator", `${wanted} booted (Android ${osVersion}, ${serial})`);
  return { deviceName: wanted, osVersion, deviceId: serial };
}

/** `image.sysdir.1=system-images/android-36/google_apis/arm64-v8a/` from an AVD's config.ini. */
export function parseAvdImageDir(configIni: string): string | undefined {
  return /^image\.sysdir\.1\s*=\s*(.+)$/m.exec(configIni)?.[1]?.trim();
}

/** The system image an AVD needs when it is not installed, else undefined (also when the config is unreadable). */
function avdMissingImage(ctx: Context, sdk: AndroidSdk, avd: string): string | undefined {
  const avdHome = ctx.sys.env.ANDROID_AVD_HOME ?? join(ctx.sys.homeDir, ".android", "avd");
  const config = ctx.sys.readText(join(avdHome, `${avd}.avd`, "config.ini"));
  const image = config === undefined ? undefined : parseAvdImageDir(config);
  if (image === undefined) return undefined;
  return ctx.sys.exists(join(sdk.root, image)) ? undefined : image;
}

function bootTimeout(avd: string, timeoutMs: number): MobileError {
  return new MobileError(
    "device-boot-timeout",
    `AVD ${avd} did not finish booting within ${Math.round(timeoutMs / 1000)}s`,
    "Cold boots of a fresh AVD can be slow: raise bootTimeoutMs, wipe the AVD (emulator -avd <name> -wipe-data), and make sure it uses an arm64-v8a image.",
  );
}

async function resolveSerial(ctx: Context, sdk: AndroidSdk, deviceId: string | undefined): Promise<string> {
  if (deviceId !== undefined) return deviceId;
  const ready = parseAdbDevices(await adbOutput(ctx, adb(sdk, undefined, "devices"))).filter((d) => d.state === "device");
  const [first, second] = ready;
  if (first === undefined) {
    throw new MobileError("no-device", "no Android device is connected", "Boot one first with ensureDevice('android').");
  }
  if (second !== undefined) {
    throw new MobileError("no-device", `several Android devices are connected (${ready.map((d) => d.serial).join(", ")})`, "Pass deviceId to pick one.");
  }
  return first.serial;
}

// ---------- build ----------

export interface BuildAndroidOptions {
  readonly clean: boolean;
  readonly abis: readonly string[];
  readonly buildTimeoutMs: number;
}

export async function buildAndroid(ctx: Context, projectDir: string, options: BuildAndroidOptions): Promise<BuildResult> {
  const started = ctx.sys.now();
  const sdk = resolveAndroidSdk(ctx.sys);
  const javaHome = resolveJavaHome(ctx.sys);
  await prepareNativeProject(ctx, projectDir, "android", {
    clean: options.clean,
    installTimeoutMs: ANDROID_DEFAULTS.installTimeoutMs,
    prebuildTimeoutMs: ANDROID_DEFAULTS.prebuildTimeoutMs,
  });

  const gradle = gradleAssembleCommand(projectDir, options.abis, javaHome, sdk);
  info(ctx, "gradle", `assembleRelease for ${options.abis.join(",")} with JDK ${javaHome}`);
  const result = await ctx.sys.run(gradle, step(ctx, "gradle", options.buildTimeoutMs));
  if (result.exitCode !== 0) {
    const log = `${result.stdout}\n${result.stderr}`;
    const { code, remedy } = classifyGradleFailure(log);
    throw new MobileError(code, `Gradle assembleRelease failed with code ${result.exitCode}`, remedy, { logTail: failureExcerpt(log) });
  }

  const apk = join(projectDir, RELEASE_APK);
  if (!ctx.sys.exists(apk)) {
    throw new MobileError("artifact-missing", `Gradle succeeded but ${apk} does not exist`, "Check android/app/build.gradle for a renamed output or a changed release variant.");
  }
  const listSpec: CommandSpec = { command: "unzip", args: ["-l", apk] };
  const listing = await runChecked(ctx.sys.run, listSpec, step(ctx, "unzip", SHORT_MS), (r) => commandFailed("unzip", listSpec, r, "The APK may be corrupt; rebuild with clean: true."));
  if (!listingHasJsBundle(listing.stdout)) {
    throw new MobileError(
      "artifact-missing",
      `${apk} has no embedded JS bundle (assets/index.android.bundle), so it would need a Metro server`,
      "Build the release variant (assembleRelease), not debug, and do not set bundleInRelease false.",
    );
  }
  const appId = await apkPackageId(ctx, sdk, apk);
  info(ctx, "gradle", `built ${apk} (${appId})`);
  return { appPath: apk, appId, durationMs: ctx.sys.now() - started };
}

async function apkPackageId(ctx: Context, sdk: AndroidSdk, apk: string): Promise<string> {
  if (sdk.aapt === undefined) {
    throw new MobileError("android-sdk-missing", "no build-tools with aapt found", 'Install build tools: sdkmanager "build-tools;35.0.0".');
  }
  const spec: CommandSpec = { command: sdk.aapt, args: ["dump", "badging", apk] };
  const result = await runChecked(ctx.sys.run, spec, step(ctx, "aapt", SHORT_MS), (r) => commandFailed("aapt", spec, r, "The APK may be corrupt; rebuild with clean: true."));
  const appId = parseBadgingPackage(result.stdout);
  if (appId === undefined) {
    throw new MobileError("artifact-missing", `could not read the package name from ${apk}`, "Rebuild with clean: true.", { logTail: tailLines(result.stdout) });
  }
  return appId;
}

// ---------- app lifecycle ----------

export async function installAndroidApp(ctx: Context, apk: string, deviceId: string | undefined, timeoutMs: number): Promise<{ appId: string; deviceId: string }> {
  const sdk = resolveAndroidSdk(ctx.sys);
  const serial = await resolveSerial(ctx, sdk, deviceId);
  const appId = await apkPackageId(ctx, sdk, apk);
  const install = adb(sdk, serial, "install", "-r", apk);
  let result = await ctx.sys.run(install, step(ctx, "adb", timeoutMs));
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE/.test(result.stdout + result.stderr)) {
    // A build signed with another key is already installed; replacing it needs a clean install.
    info(ctx, "adb", `${appId} is installed with a different signature, uninstalling first`);
    await uninstallAndroidApp(ctx, appId, serial, timeoutMs);
    result = await ctx.sys.run(install, step(ctx, "adb", timeoutMs));
  }
  if (result.exitCode !== 0 || !/^Success/m.test(result.stdout)) {
    throw new MobileError("install-failed", `adb install of ${apk} on ${serial} failed`, "Check free space on the emulator and that the APK ABI matches the AVD (arm64-v8a).", {
      logTail: tailLines(`${result.stdout}\n${result.stderr}`),
    });
  }
  info(ctx, "adb", `installed ${appId} on ${serial}`);
  return { appId, deviceId: serial };
}

/** Idempotent: uninstalling an app that is not installed succeeds. */
export async function uninstallAndroidApp(ctx: Context, appId: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const sdk = resolveAndroidSdk(ctx.sys);
  const serial = await resolveSerial(ctx, sdk, deviceId);
  const result = await ctx.sys.run(adb(sdk, serial, "uninstall", appId), step(ctx, "adb", timeoutMs));
  const output = `${result.stdout}\n${result.stderr}`;
  if (/^Success/m.test(result.stdout) || /Unknown package|not installed for|DELETE_FAILED_INTERNAL_ERROR/.test(output)) return;
  throw new MobileError("install-failed", `adb uninstall ${appId} on ${serial} failed`, "Uninstall it by hand from the emulator, or wipe the AVD.", { logTail: tailLines(output) });
}

export async function launchAndroidApp(ctx: Context, appId: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const sdk = resolveAndroidSdk(ctx.sys);
  const serial = await resolveSerial(ctx, sdk, deviceId);
  // `monkey` exits non-zero even when it launches the app, so resolve the launcher activity and start it explicitly.
  const resolveSpec = adb(sdk, serial, "shell", "cmd", "package", "resolve-activity", "--brief", "-c", "android.intent.category.LAUNCHER", appId);
  const resolved = await ctx.sys.run(resolveSpec, step(ctx, "adb", timeoutMs));
  const component = parseLauncherComponent(resolved.stdout);
  if (resolved.exitCode !== 0 || component === undefined) {
    throw new MobileError("launch-failed", `${appId} has no launcher activity on ${serial}`, "Check the app is installed (installApp) and declares a LAUNCHER activity.", {
      logTail: tailLines(`${resolved.stdout}\n${resolved.stderr}`),
    });
  }
  const start = adb(sdk, serial, "shell", "am", "start", "-W", "-n", component);
  const started = await ctx.sys.run(start, step(ctx, "adb", timeoutMs));
  if (started.exitCode !== 0 || !/^Status: ok/m.test(started.stdout)) {
    throw new MobileError("launch-failed", `could not start ${component} on ${serial}`, "Read the log tail; run adb logcat for a crash on startup.", {
      logTail: tailLines(`${started.stdout}\n${started.stderr}`),
    });
  }
}

/** The `package/.Activity` line of `cmd package resolve-activity --brief`. */
export function parseLauncherComponent(stdout: string): string | undefined {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[\w.]+\/[\w.$]+$/.test(l))
    .at(-1);
}

export async function screenshotAndroid(ctx: Context, outPath: string, deviceId: string | undefined, timeoutMs: number): Promise<void> {
  const sdk = resolveAndroidSdk(ctx.sys);
  const serial = await resolveSerial(ctx, sdk, deviceId);
  const spec = adb(sdk, serial, "exec-out", "screencap", "-p");
  const result = await runChecked(ctx.sys.run, spec, step(ctx, "adb", timeoutMs, true), (r) => commandFailed("adb", spec, r, "Check the emulator is booted and unlocked."));
  await writeFile(outPath, result.stdoutBytes);
}
