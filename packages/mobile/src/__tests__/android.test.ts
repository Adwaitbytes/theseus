import { describe, expect, it } from "vitest";
import {
  buildAndroid,
  classifyGradleFailure,
  emulatorLaunchCommand,
  ensureAndroidDevice,
  gradleAssembleCommand,
  installAndroidApp,
  launchAndroidApp,
  listingHasJsBundle,
  parseAdbDevices,
  parseAvdList,
  parseBadgingPackage,
  parseEmuAvdName,
  parseLauncherComponent,
  uninstallAndroidApp,
} from "../android.js";
import { createContext } from "../system.js";
import { type AndroidSdk, newestVersionDir, resolveAndroidSdk, resolveJavaHome } from "../toolchain.js";
import { fakeSystem, line } from "./fake-system.js";

const SDK = "/home/test/Library/Android/sdk";
const ADB = `${SDK}/platform-tools/adb`;
const EMULATOR = `${SDK}/emulator/emulator`;
const AAPT = `${SDK}/build-tools/36.0.0/aapt`;
const JDK = "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home";
const sdkFiles = [`${SDK}/platform-tools`, ADB, EMULATOR, AAPT, `${JDK}/bin/java`];
const sdkDirs = { [`${SDK}/build-tools`]: ["35.0.0", "36.0.0", "34.0.0"] };
const sdk: AndroidSdk = { root: SDK, adb: ADB, emulator: EMULATOR, aapt: AAPT };

describe("parsers", () => {
  it("parses AVD names and skips emulator diagnostics", () => {
    expect(parseAvdList("INFO    | Storing crashdata in: /tmp/x\nasktrix_pixel\nopx_pixel\n\n")).toEqual(["asktrix_pixel", "opx_pixel"]);
  });

  it("parses adb devices including offline emulators", () => {
    const out = "* daemon started successfully\nList of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n\n";
    expect(parseAdbDevices(out)).toEqual([
      { serial: "emulator-5554", state: "device" },
      { serial: "emulator-5556", state: "offline" },
    ]);
  });

  it("reads the AVD name from the emulator console reply", () => {
    expect(parseEmuAvdName("asktrix_pixel\r\nOK\r\n")).toBe("asktrix_pixel");
    expect(parseEmuAvdName("OK\n")).toBeUndefined();
  });

  it("reads the package name from aapt badging", () => {
    expect(parseBadgingPackage("package: name='dev.theseus.expohello' versionCode='1' versionName='1.0.0'\nsdkVersion:'24'")).toBe("dev.theseus.expohello");
  });

  it("detects the embedded JS bundle in an unzip listing", () => {
    expect(listingHasJsBundle("  1234  2026-11-21 03:00   assets/index.android.bundle\n  10 2026-11-21 03:00 classes.dex")).toBe(true);
    expect(listingHasJsBundle("  10 2026-11-21 03:00 classes.dex")).toBe(false);
  });

  it("picks the newest build-tools directory numerically", () => {
    expect(newestVersionDir(["9.0.0", "35.0.0", "36.0.0", "36.0.0-rc1", "licenses"])).toBe("36.0.0");
  });
});

describe("classifyGradleFailure", () => {
  it.each([
    ["SDK location not found. Define a valid SDK location with an ANDROID_HOME", "android-sdk-missing"],
    ["Unsupported class file major version 69", "java-missing"],
    ["Execution failed for task ':app:packageRelease'. > Failed to read key androiddebugkey from store", "signing-failed"],
    ["error: cannot find symbol MainApplication", "build-failed"],
  ])("classifies %s", (log, code) => {
    expect(classifyGradleFailure(log).code).toBe(code);
  });
});

describe("command construction", () => {
  it("runs assembleRelease for the requested ABIs with JDK and SDK in the env", () => {
    const spec = gradleAssembleCommand("/p", ["arm64-v8a", "x86_64"], JDK, sdk);
    expect(spec).toEqual({
      command: "./gradlew",
      args: ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a,x86_64", "--console=plain"],
      cwd: "/p/android",
      env: { JAVA_HOME: JDK, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK, NODE_ENV: "production" },
    });
  });

  it("adds -no-window only when headless", () => {
    expect(emulatorLaunchCommand(sdk, "pixel", false).args).not.toContain("-no-window");
    expect(emulatorLaunchCommand(sdk, "pixel", true).args).toContain("-no-window");
  });
});

describe("toolchain resolution", () => {
  it("prefers ANDROID_HOME and finds aapt in the newest build-tools", () => {
    const sys = fakeSystem(() => ({}), ["/custom/sdk/platform-tools", "/custom/sdk/platform-tools/adb", "/custom/sdk/build-tools/35.0.0/aapt"], {
      "/custom/sdk/build-tools": ["35.0.0"],
    }, { ANDROID_HOME: "/custom/sdk" });
    expect(resolveAndroidSdk(sys)).toMatchObject({ root: "/custom/sdk", aapt: "/custom/sdk/build-tools/35.0.0/aapt" });
  });

  it("throws android-sdk-missing with a remedy when no SDK exists", () => {
    expect(() => resolveAndroidSdk(fakeSystem(() => ({})))).toThrowError(expect.objectContaining({ code: "android-sdk-missing" }));
  });

  it("throws java-missing when no JDK 17 is found", () => {
    expect(() => resolveJavaHome(fakeSystem(() => ({})))).toThrowError(expect.objectContaining({ code: "java-missing", remedy: expect.stringContaining("openjdk@17") }));
  });
});

describe("ensureAndroidDevice", () => {
  it("returns the running emulator without booting another", async () => {
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.endsWith("-list-avds")) return { stdout: "asktrix_pixel\nopx_pixel\n" };
      if (cmd.endsWith(" devices")) return { stdout: "List of devices attached\nemulator-5554\tdevice\n" };
      if (cmd.endsWith("emu avd name")) return { stdout: "opx_pixel\nOK\n" };
      if (cmd.endsWith("sys.boot_completed")) return { stdout: "1\n" };
      if (cmd.endsWith("ro.build.version.release")) return { stdout: "15\n" };
      return {};
    }, sdkFiles, sdkDirs);
    const device = await ensureAndroidDevice(createContext({ system: sys }), { avd: undefined, headless: false, bootTimeoutMs: 60_000 });
    expect(device).toEqual({ deviceName: "opx_pixel", osVersion: "15", deviceId: "emulator-5554" });
    expect(sys.detached).toEqual([]);
  });

  it("boots the requested AVD and polls until boot completes", async () => {
    let devicesCalls = 0;
    let bootPolls = 0;
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.endsWith("-list-avds")) return { stdout: "asktrix_pixel\nopx_pixel\n" };
      if (cmd.endsWith(" devices")) {
        devicesCalls++;
        return { stdout: devicesCalls >= 3 ? "List of devices attached\nemulator-5554\toffline\n" : "List of devices attached\n" };
      }
      if (cmd.endsWith("emu avd name")) return { stdout: "asktrix_pixel\nOK\n" };
      if (cmd.endsWith("sys.boot_completed")) return { stdout: ++bootPolls >= 3 ? "1\n" : "\n" };
      if (cmd.endsWith("ro.build.version.release")) return { stdout: "16\n" };
      return {};
    }, sdkFiles, sdkDirs);
    const device = await ensureAndroidDevice(createContext({ system: sys }), { avd: "asktrix_pixel", headless: true, bootTimeoutMs: 60_000 });
    expect(device).toEqual({ deviceName: "asktrix_pixel", osVersion: "16", deviceId: "emulator-5554" });
    expect(sys.detached.map(line)).toEqual([`${EMULATOR} -avd asktrix_pixel -no-boot-anim -no-snapshot-save -netdelay none -netspeed full -no-window`]);
  });

  it("times out with device-boot-timeout when boot never completes", async () => {
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.endsWith("-list-avds")) return { stdout: "pixel\n" };
      if (cmd.endsWith(" devices")) return { stdout: "List of devices attached\nemulator-5554\tdevice\n" };
      if (cmd.endsWith("emu avd name")) return { stdout: "pixel\nOK\n" };
      return { stdout: "0\n" };
    }, sdkFiles, sdkDirs);
    await expect(ensureAndroidDevice(createContext({ system: sys }), { avd: undefined, headless: true, bootTimeoutMs: 10_000 })).rejects.toMatchObject({
      code: "device-boot-timeout",
    });
  });

  it("reports no-avd with a creation command when the SDK has none", async () => {
    const sys = fakeSystem(() => ({ stdout: "" }), sdkFiles, sdkDirs);
    await expect(ensureAndroidDevice(createContext({ system: sys }), { avd: undefined, headless: true, bootTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "no-avd",
      remedy: expect.stringContaining("avdmanager create avd"),
    });
  });

  const avdResponder = (spec: { command: string; args: readonly string[] }) => {
    const cmd = line(spec);
    if (cmd.endsWith("-list-avds")) return { stdout: "broken_pixel\ngood_pixel\n" };
    return { stdout: "List of devices attached\n" };
  };
  const avdConfig = (image: string) => `AvdId=x\nimage.sysdir.1=${image}\n`;

  it("skips an AVD whose system image is not installed when choosing a default", async () => {
    const sys = fakeSystem(avdResponder, [...sdkFiles, `${SDK}/system-images/android-35/google_apis/arm64-v8a/`], sdkDirs);
    sys.texts["/home/test/.android/avd/broken_pixel.avd/config.ini"] = avdConfig("system-images/android-36/google_apis/arm64-v8a/");
    sys.texts["/home/test/.android/avd/good_pixel.avd/config.ini"] = avdConfig("system-images/android-35/google_apis/arm64-v8a/");
    await expect(ensureAndroidDevice(createContext({ system: sys }), { avd: undefined, headless: true, bootTimeoutMs: 4_000 })).rejects.toMatchObject({
      code: "device-boot-timeout",
    });
    expect(sys.detached.map((s) => s.args[1])).toEqual(["good_pixel"]);
  });

  it("refuses to boot an explicitly requested AVD with a missing image and names the sdkmanager package", async () => {
    const sys = fakeSystem(avdResponder, sdkFiles, sdkDirs);
    sys.texts["/home/test/.android/avd/broken_pixel.avd/config.ini"] = avdConfig("system-images/android-36/google_apis/arm64-v8a/");
    await expect(ensureAndroidDevice(createContext({ system: sys }), { avd: "broken_pixel", headless: true, bootTimeoutMs: 4_000 })).rejects.toMatchObject({
      code: "no-avd",
      remedy: expect.stringContaining('sdkmanager "system-images;android-36;google_apis;arm64-v8a"'),
    });
    expect(sys.detached).toEqual([]);
  });

  it("fails fast with the emulator's FATAL line instead of waiting for the timeout", async () => {
    const sys = fakeSystem(avdResponder, sdkFiles, sdkDirs);
    const original = sys.spawnDetached;
    const withCrash: typeof original = async (spec, logFile) => {
      await original(spec, logFile);
      sys.texts[logFile] = "INFO | starting\nFATAL        | Cannot find AVD system path. Please define ANDROID_SDK_ROOT\n";
    };
    const ctx = createContext({ system: { ...sys, spawnDetached: withCrash } });
    await expect(ensureAndroidDevice(ctx, { avd: "good_pixel", headless: true, bootTimeoutMs: 600_000 })).rejects.toMatchObject({
      code: "device-boot-timeout",
      message: expect.stringContaining("Cannot find AVD system path"),
    });
    expect(sys.clock).toBe(0);
  });

  it("rejects an unknown AVD name and lists the real ones", async () => {
    const sys = fakeSystem((spec) => (line(spec).endsWith("-list-avds") ? { stdout: "pixel\n" } : { stdout: "List of devices attached\n" }), sdkFiles, sdkDirs);
    await expect(ensureAndroidDevice(createContext({ system: sys }), { avd: "nope", headless: true, bootTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "no-avd",
      remedy: "Use one of: pixel.",
    });
  });
});

describe("buildAndroid", () => {
  const project = "/p";
  const projectFiles = [...sdkFiles, "/p/package.json", "/p/app.json", "/p/node_modules/expo", "/p/android/app/build/outputs/apk/release/app-release.apk"];

  it("prebuilds, assembles release and verifies the embedded bundle", async () => {
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.startsWith("unzip")) return { stdout: "  99  2026-11-21 03:00   assets/index.android.bundle\n" };
      if (cmd.includes("dump badging")) return { stdout: "package: name='dev.theseus.expohello' versionCode='1'" };
      return {};
    }, projectFiles, sdkDirs);
    const result = await buildAndroid(createContext({ system: sys }), project, { clean: false, abis: ["arm64-v8a"], buildTimeoutMs: 60_000 });
    expect(result).toMatchObject({ appPath: "/p/android/app/build/outputs/apk/release/app-release.apk", appId: "dev.theseus.expohello" });
    expect(sys.calls).toEqual([
      "npx expo prebuild --platform android --no-install",
      "./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain",
      "unzip -l /p/android/app/build/outputs/apk/release/app-release.apk",
      `${AAPT} dump badging /p/android/app/build/outputs/apk/release/app-release.apk`,
    ]);
  });

  it("installs dependencies with npm ci when node_modules is missing and a lockfile exists", async () => {
    const files = projectFiles.filter((f) => f !== "/p/node_modules/expo").concat("/p/package-lock.json");
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.startsWith("unzip")) return { stdout: " 1 x assets/index.android.bundle\n" };
      if (cmd.includes("dump badging")) return { stdout: "package: name='a.b'" };
      return {};
    }, files, sdkDirs);
    await buildAndroid(createContext({ system: sys }), project, { clean: true, abis: ["arm64-v8a"], buildTimeoutMs: 60_000 });
    expect(sys.calls.slice(0, 2)).toEqual(["npm ci --no-audit --no-fund", "npx expo prebuild --platform android --no-install --clean"]);
  });

  it("turns a Gradle failure into a typed error with the log tail", async () => {
    const sys = fakeSystem((spec) =>
      spec.command === "./gradlew" ? { exitCode: 1, stdout: "> Task :app:compileReleaseKotlin\nUnsupported class file major version 69\n" } : {},
    projectFiles, sdkDirs);
    await expect(buildAndroid(createContext({ system: sys }), project, { clean: false, abis: ["arm64-v8a"], buildTimeoutMs: 60_000 })).rejects.toMatchObject({
      code: "java-missing",
      logTail: expect.stringContaining("major version 69"),
    });
  });

  it("refuses an APK without an embedded bundle", async () => {
    const sys = fakeSystem((spec) => (line(spec).startsWith("unzip") ? { stdout: " 1 x classes.dex\n" } : {}), projectFiles, sdkDirs);
    await expect(buildAndroid(createContext({ system: sys }), project, { clean: false, abis: ["arm64-v8a"], buildTimeoutMs: 60_000 })).rejects.toMatchObject({
      code: "artifact-missing",
    });
  });

  it("rejects a directory that is not an Expo project", async () => {
    const sys = fakeSystem(() => ({}), sdkFiles, sdkDirs);
    await expect(buildAndroid(createContext({ system: sys }), "/empty", { clean: false, abis: ["arm64-v8a"], buildTimeoutMs: 1 })).rejects.toMatchObject({
      code: "invalid-project",
    });
  });
});

describe("app lifecycle", () => {
  const apk = "/p/app-release.apk";

  it("reinstalls after uninstalling when the signature changed", async () => {
    let installs = 0;
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.endsWith(" devices")) return { stdout: "List of devices attached\nemulator-5554\tdevice\n" };
      if (cmd.includes("dump badging")) return { stdout: "package: name='dev.theseus.expohello'" };
      if (cmd.includes(" install -r ")) {
        installs++;
        return installs === 1 ? { exitCode: 1, stderr: "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]" } : { stdout: "Performing Streamed Install\nSuccess\n" };
      }
      if (cmd.includes(" uninstall ")) return { stdout: "Success\n" };
      return {};
    }, sdkFiles, sdkDirs);
    await expect(installAndroidApp(createContext({ system: sys }), apk, undefined, 10_000)).resolves.toEqual({ appId: "dev.theseus.expohello", deviceId: "emulator-5554" });
    expect(sys.calls.filter((c) => c.startsWith(ADB) && !c.endsWith(" devices"))).toEqual([
      `${ADB} -s emulator-5554 install -r ${apk}`,
      `${ADB} -s emulator-5554 uninstall dev.theseus.expohello`,
      `${ADB} -s emulator-5554 install -r ${apk}`,
    ]);
  });

  it("asks for a deviceId when several devices are connected", async () => {
    const sys = fakeSystem((spec) => (line(spec).endsWith(" devices") ? { stdout: "emulator-5554\tdevice\nemulator-5556\tdevice\n" } : {}), sdkFiles, sdkDirs);
    await expect(installAndroidApp(createContext({ system: sys }), apk, undefined, 10_000)).rejects.toMatchObject({ code: "no-device" });
  });

  it("parses the launcher component and rejects 'No activity found'", () => {
    expect(parseLauncherComponent("priority=0 preferredOrder=0 match=0x108000\ndev.theseus.expohello/.MainActivity\n")).toBe("dev.theseus.expohello/.MainActivity");
    expect(parseLauncherComponent("No activity found\n")).toBeUndefined();
  });

  it("launches the resolved activity and requires Status: ok", async () => {
    const sys = fakeSystem((spec) => {
      const cmd = line(spec);
      if (cmd.includes("resolve-activity")) return { stdout: "priority=0\ndev.theseus.expohello/.MainActivity\n" };
      if (cmd.includes("am start")) return { stdout: "Starting: Intent\nStatus: ok\nLaunchState: COLD\n" };
      return {};
    }, sdkFiles, sdkDirs);
    await launchAndroidApp(createContext({ system: sys }), "dev.theseus.expohello", "emulator-5554", 10_000);
    expect(sys.calls.at(-1)).toBe(`${ADB} -s emulator-5554 shell am start -W -n dev.theseus.expohello/.MainActivity`);
  });

  it("reports launch-failed when the package has no launcher activity", async () => {
    const sys = fakeSystem(() => ({ stdout: "No activity found\n" }), sdkFiles, sdkDirs);
    await expect(launchAndroidApp(createContext({ system: sys }), "no.such.app", "emulator-5554", 10_000)).rejects.toMatchObject({ code: "launch-failed" });
  });

  it("treats uninstalling a missing package as success", async () => {
    const sys = fakeSystem(() => ({ exitCode: 1, stdout: "Failure [DELETE_FAILED_INTERNAL_ERROR]" }), sdkFiles, sdkDirs);
    await expect(uninstallAndroidApp(createContext({ system: sys }), "dev.theseus.expohello", "emulator-5554", 10_000)).resolves.toBeUndefined();
  });
});
