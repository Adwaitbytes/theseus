import { describe, expect, it } from "vitest";
import { MobileError } from "../errors.js";
import {
  buildIos,
  chooseSimulator,
  classifyXcodeFailure,
  ensureIosDevice,
  installIosApp,
  parseSimctlDevices,
  runtimeOsVersion,
  uninstallIosApp,
  xcodebuildCommand,
  zipAppCommand,
} from "../ios.js";
import { createContext } from "../system.js";
import { fakeSystem, line } from "./fake-system.js";

const SIMCTL_JSON = JSON.stringify({
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4": [{ udid: "DUO", name: "iPhone Duo", state: "Shutdown", isAvailable: true }],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [{ udid: "OLD", name: "iPhone 17", state: "Shutdown", isAvailable: true }],
    "com.apple.CoreSimulator.SimRuntime.iOS-27-2": [
      { udid: "PRO", name: "iPhone 18 Pro", state: "Shutdown", isAvailable: true },
      { udid: "IPAD", name: "iPad Air 11-inch (M4)", state: "Shutdown", isAvailable: true },
      { udid: "GONE", name: "iPhone 16", state: "Shutdown", isAvailable: false },
    ],
    "com.apple.CoreSimulator.SimRuntime.watchOS-12-0": [],
  },
});

const simctlResponder = (json: string, extra: (cmd: string) => { exitCode?: number; stdout?: string; stderr?: string } | undefined = () => undefined) =>
  (spec: { command: string; args: readonly string[] }) => {
    const cmd = line(spec);
    if (cmd === "xcrun simctl list devices available --json") return { stdout: json };
    return extra(cmd) ?? {};
  };

describe("parsers", () => {
  it("maps runtime ids to OS versions and skips device-specific runtimes", () => {
    expect(runtimeOsVersion("com.apple.CoreSimulator.SimRuntime.iOS-27-2")).toBe("27.2");
    expect(runtimeOsVersion("com.apple.CoreSimulator.SimRuntime.iOS-17-5")).toBe("17.5");
    expect(runtimeOsVersion("com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4")).toBeUndefined();
    expect(runtimeOsVersion("com.apple.CoreSimulator.SimRuntime.watchOS-12-0")).toBeUndefined();
  });

  it("lists available iOS simulators, newest runtime first", () => {
    expect(parseSimctlDevices(SIMCTL_JSON).map((s) => `${s.name}@${s.osVersion}`)).toEqual([
      "iPhone 18 Pro@27.2",
      "iPad Air 11-inch (M4)@27.2",
      "iPhone 17@26.0",
    ]);
  });

  it("rejects malformed simctl output", () => {
    expect(() => parseSimctlDevices(JSON.stringify({ devices: [] }))).toThrow();
  });

  it("chooses by name, then a booted iPhone, then the first iPhone", () => {
    const sims = parseSimctlDevices(SIMCTL_JSON);
    expect(chooseSimulator(sims, "iPhone 17")?.udid).toBe("OLD");
    expect(chooseSimulator(sims, undefined)?.udid).toBe("PRO");
    expect(chooseSimulator(sims.map((s) => (s.udid === "OLD" ? { ...s, state: "Booted" } : s)), undefined)?.udid).toBe("OLD");
    expect(chooseSimulator(sims, "Nokia")).toBeUndefined();
  });
});

describe("classifyXcodeFailure", () => {
  it.each([
    ['error: Signing for "ExpoHello" requires a development team.', "signing-failed"],
    ["xcode-select: error: tool 'xcodebuild' requires Xcode", "xcode-missing"],
    ["error: Unable to find a destination matching the provided destination specifier", "xcode-missing"],
    ["error: cannot find 'Foo' in scope", "build-failed"],
  ])("classifies %s", (log, code) => {
    expect(classifyXcodeFailure(log).code).toBe(code);
  });
});

describe("command construction", () => {
  it("builds Release for the generic simulator destination, arm64 only", () => {
    expect(xcodebuildCommand("/p", "ExpoHello.xcworkspace", "ExpoHello")).toEqual({
      command: "xcodebuild",
      args: [
        "-workspace", "ios/ExpoHello.xcworkspace",
        "-scheme", "ExpoHello",
        "-configuration", "Release",
        "-sdk", "iphonesimulator",
        "-destination", "generic/platform=iOS Simulator",
        "-derivedDataPath", "ios/build",
        "ARCHS=arm64",
        "ONLY_ACTIVE_ARCH=NO",
        "build",
      ],
      cwd: "/p",
      env: { NODE_ENV: "production" },
    });
  });

  it("zips the .app with the bundle at the archive root", () => {
    expect(zipAppCommand("/b/ExpoHello.app", "/b/ExpoHello.zip")).toEqual({
      command: "ditto",
      args: ["-c", "-k", "--sequesterRsrc", "--keepParent", "/b/ExpoHello.app", "/b/ExpoHello.zip"],
    });
  });
});

describe("ensureIosDevice", () => {
  it("does not boot an already booted simulator", async () => {
    const booted = SIMCTL_JSON.replace('"udid":"PRO","name":"iPhone 18 Pro","state":"Shutdown"', '"udid":"PRO","name":"iPhone 18 Pro","state":"Booted"');
    const sys = fakeSystem(simctlResponder(booted));
    const device = await ensureIosDevice(createContext({ system: sys }), { deviceName: undefined, headless: true, bootTimeoutMs: 1_000 });
    expect(device).toEqual({ deviceName: "iPhone 18 Pro", osVersion: "27.2", deviceId: "PRO" });
    expect(sys.calls).toEqual(["xcrun simctl list devices available --json", "xcrun simctl bootstatus PRO -b"]);
  });

  it("boots, waits and opens Simulator.app when not headless", async () => {
    const sys = fakeSystem(simctlResponder(SIMCTL_JSON), [], {}, { THESEUS_SIMULATOR: "iPhone 18 Pro" });
    await ensureIosDevice(createContext({ system: sys }), { deviceName: undefined, headless: false, bootTimeoutMs: 1_000 });
    expect(sys.calls).toEqual([
      "xcrun simctl list devices available --json",
      "xcrun simctl boot PRO",
      "xcrun simctl bootstatus PRO -b",
      "open -a Simulator --args -CurrentDeviceUDID PRO",
    ]);
  });

  it("reports a missing Simulator.app as a log line, not a failure", async () => {
    const logs: string[] = [];
    const sys = fakeSystem(simctlResponder(SIMCTL_JSON, (cmd) =>
      cmd.startsWith("open ") ? { exitCode: 1, stderr: "Unable to find application named 'Simulator'" } : undefined,
    ));
    await expect(
      ensureIosDevice(createContext({ system: sys, onLog: (l) => logs.push(l.text) }), { deviceName: undefined, headless: false, bootTimeoutMs: 1_000 }),
    ).resolves.toMatchObject({ deviceId: "PRO" });
    expect(logs.some((l) => l.includes("Unable to find application named 'Simulator'"))).toBe(true);
  });

  it("tolerates a boot race where the device is already Booted", async () => {
    const sys = fakeSystem(simctlResponder(SIMCTL_JSON, (cmd) =>
      cmd === "xcrun simctl boot PRO" ? { exitCode: 149, stderr: "Unable to boot device in current state: Booted" } : undefined,
    ));
    await expect(ensureIosDevice(createContext({ system: sys }), { deviceName: undefined, headless: true, bootTimeoutMs: 1_000 })).resolves.toMatchObject({ deviceId: "PRO" });
  });

  it("maps a bootstatus timeout to device-boot-timeout", async () => {
    const sys = fakeSystem((spec) => {
      if (line(spec).includes("bootstatus")) throw new MobileError("timeout", "slow", "wait");
      return simctlResponder(SIMCTL_JSON)(spec);
    });
    await expect(ensureIosDevice(createContext({ system: sys }), { deviceName: undefined, headless: true, bootTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "device-boot-timeout",
    });
  });

  it("lists real simulator names for an unknown one", async () => {
    const sys = fakeSystem(simctlResponder(SIMCTL_JSON));
    await expect(ensureIosDevice(createContext({ system: sys }), { deviceName: "Pixel", headless: true, bootTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "no-simulator",
      remedy: expect.stringContaining("iPhone 18 Pro"),
    });
  });
});

describe("buildIos", () => {
  const files = ["/p/package.json", "/p/app.json", "/p/node_modules/expo", "/p/ios/build/Build/Products/Release-iphonesimulator/ExpoHello.app/main.jsbundle"];
  const dirs = {
    "/p/ios": ["Podfile", "ExpoHello.xcodeproj", "ExpoHello.xcworkspace"],
    "/p/ios/build/Build/Products/Release-iphonesimulator": ["ExpoHello.app", "ExpoHello.app.dSYM"],
  };

  it("prebuilds, installs pods, builds, reads the bundle id and zips the .app", async () => {
    const sys = fakeSystem((spec) => (spec.command === "plutil" ? { stdout: "dev.theseus.expohello\n" } : {}), files, dirs);
    const result = await buildIos(createContext({ system: sys }), "/p", { clean: false, buildTimeoutMs: 60_000 });
    expect(result).toMatchObject({ appPath: "/p/ios/build/ExpoHello.zip", appId: "dev.theseus.expohello" });
    expect(sys.calls.map((c) => c.split(" ").slice(0, 2).join(" "))).toEqual(["npx expo", "pod install", "xcodebuild -workspace", "plutil -extract", "ditto -c"]);
  });

  it("reports cocoapods-missing when pod is not installed", async () => {
    const sys = fakeSystem((spec) => {
      if (spec.command === "pod") throw new MobileError("command-not-found", "pod was not found", "install");
      return {};
    }, files, dirs);
    await expect(buildIos(createContext({ system: sys }), "/p", { clean: false, buildTimeoutMs: 60_000 })).rejects.toMatchObject({
      code: "cocoapods-missing",
      remedy: "Install it: brew install cocoapods",
    });
  });

  it("keeps the compiler error lines as the log tail on a failed build", async () => {
    const sys = fakeSystem((spec) =>
      spec.command === "xcodebuild" ? { exitCode: 65, stdout: "CompileSwift\n/p/ios/App.swift:3:1: error: cannot find 'Foo' in scope\n** BUILD FAILED **\n" } : {},
    files, dirs);
    await expect(buildIos(createContext({ system: sys }), "/p", { clean: false, buildTimeoutMs: 60_000 })).rejects.toMatchObject({
      code: "build-failed",
      logTail: "/p/ios/App.swift:3:1: error: cannot find 'Foo' in scope",
    });
  });

  it("refuses a .app without an embedded main.jsbundle", async () => {
    const sys = fakeSystem(() => ({}), files.slice(0, 3), dirs);
    await expect(buildIos(createContext({ system: sys }), "/p", { clean: false, buildTimeoutMs: 60_000 })).rejects.toMatchObject({ code: "artifact-missing" });
  });
});

describe("app lifecycle", () => {
  it("installs a bare .app on the booted simulator", async () => {
    const booted = SIMCTL_JSON.replace('"udid":"PRO","name":"iPhone 18 Pro","state":"Shutdown"', '"udid":"PRO","name":"iPhone 18 Pro","state":"Booted"');
    const sys = fakeSystem(simctlResponder(booted, (cmd) => (cmd.startsWith("plutil") ? { stdout: "dev.theseus.expohello\n" } : undefined)));
    await expect(installIosApp(createContext({ system: sys }), "/b/ExpoHello.app", undefined, 1_000)).resolves.toEqual({ appId: "dev.theseus.expohello", deviceId: "PRO" });
    expect(sys.calls.at(-1)).toBe("xcrun simctl install PRO /b/ExpoHello.app");
  });

  it("fails clearly when no simulator is booted", async () => {
    const sys = fakeSystem(simctlResponder(SIMCTL_JSON));
    await expect(installIosApp(createContext({ system: sys }), "/b/ExpoHello.app", undefined, 1_000)).rejects.toMatchObject({ code: "no-device" });
  });

  it("surfaces an uninstall failure that is not 'not installed'", async () => {
    const sys = fakeSystem(() => ({ exitCode: 1, stderr: "An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=60)" }));
    await expect(uninstallIosApp(createContext({ system: sys }), "dev.theseus.expohello", "PRO", 1_000)).rejects.toMatchObject({ code: "command-failed" });
  });
});
