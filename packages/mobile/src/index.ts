import { resolve } from "node:path";
import {
  ANDROID_DEFAULTS,
  buildAndroid,
  ensureAndroidDevice,
  installAndroidApp,
  launchAndroidApp,
  screenshotAndroid,
  uninstallAndroidApp,
} from "./android.js";
import { IOS_DEFAULTS, buildIos, ensureIosDevice, installIosApp, launchIosApp, screenshotIos, uninstallIosApp } from "./ios.js";
import { createContext } from "./system.js";
import type { BuildOptions, BuildResult, DeviceInfo, DeviceOperationOptions, EnsureDeviceOptions, MobilePlatform } from "./types.js";

export { MobileError, isMobileError, type MobileErrorCode } from "./errors.js";
export type { CommandResult, CommandSpec, LogFn, LogLine, Runner } from "./exec.js";
export type { OperationOptions, System } from "./system.js";
export type * from "./types.js";

/**
 * Boots the Android emulator or iOS simulator if needed and waits until it is fully booted.
 * Calling it again while the device is up returns immediately.
 */
export function ensureDevice(platform: MobilePlatform, options: EnsureDeviceOptions = {}): Promise<DeviceInfo> {
  const ctx = createContext(options);
  const headless = options.headless ?? false;
  return platform === "android"
    ? ensureAndroidDevice(ctx, { avd: options.deviceName, headless, bootTimeoutMs: options.bootTimeoutMs ?? ANDROID_DEFAULTS.bootTimeoutMs })
    : ensureIosDevice(ctx, { deviceName: options.deviceName, headless, bootTimeoutMs: options.bootTimeoutMs ?? IOS_DEFAULTS.bootTimeoutMs });
}

/**
 * Builds a standalone release artifact of an Expo project with the JS bundle embedded, so it runs
 * without a Metro server: an `.apk` for the Android emulator, a `.zip` of the simulator `.app` for iOS.
 * `appPath` is exactly what Kane's `--app` takes for `--target emulator|simulator`.
 */
export function buildExpo(projectDir: string, platform: MobilePlatform, options: BuildOptions = {}): Promise<BuildResult> {
  const ctx = createContext(options);
  const dir = resolve(projectDir);
  const clean = options.clean ?? false;
  return platform === "android"
    ? buildAndroid(ctx, dir, { clean, abis: options.androidAbis ?? ANDROID_DEFAULTS.abis, buildTimeoutMs: options.buildTimeoutMs ?? ANDROID_DEFAULTS.buildTimeoutMs })
    : buildIos(ctx, dir, { clean, buildTimeoutMs: options.buildTimeoutMs ?? IOS_DEFAULTS.buildTimeoutMs });
}

/** Installs an `.apk`, or an iOS `.zip`/`.app`, replacing any previous install. Returns the app id it installed. */
export function installApp(platform: MobilePlatform, appPath: string, options: DeviceOperationOptions = {}): Promise<{ appId: string; deviceId: string }> {
  const ctx = createContext(options);
  const path = resolve(appPath);
  return platform === "android"
    ? installAndroidApp(ctx, path, options.deviceId, options.timeoutMs ?? ANDROID_DEFAULTS.deviceOpTimeoutMs)
    : installIosApp(ctx, path, options.deviceId, options.timeoutMs ?? IOS_DEFAULTS.deviceOpTimeoutMs);
}

/** Removes the app by package name or bundle id. Succeeds when it is not installed. */
export function uninstallApp(platform: MobilePlatform, appId: string, options: DeviceOperationOptions = {}): Promise<void> {
  const ctx = createContext(options);
  return platform === "android"
    ? uninstallAndroidApp(ctx, appId, options.deviceId, options.timeoutMs ?? ANDROID_DEFAULTS.deviceOpTimeoutMs)
    : uninstallIosApp(ctx, appId, options.deviceId, options.timeoutMs ?? IOS_DEFAULTS.deviceOpTimeoutMs);
}

export function launchApp(platform: MobilePlatform, appId: string, options: DeviceOperationOptions = {}): Promise<void> {
  const ctx = createContext(options);
  return platform === "android"
    ? launchAndroidApp(ctx, appId, options.deviceId, options.timeoutMs ?? ANDROID_DEFAULTS.deviceOpTimeoutMs)
    : launchIosApp(ctx, appId, options.deviceId, options.timeoutMs ?? IOS_DEFAULTS.deviceOpTimeoutMs);
}

/** Writes a PNG of the device screen to `outPath`. */
export function captureScreenshot(platform: MobilePlatform, outPath: string, options: DeviceOperationOptions = {}): Promise<void> {
  const ctx = createContext(options);
  const path = resolve(outPath);
  return platform === "android"
    ? screenshotAndroid(ctx, path, options.deviceId, options.timeoutMs ?? ANDROID_DEFAULTS.deviceOpTimeoutMs)
    : screenshotIos(ctx, path, options.deviceId, options.timeoutMs ?? IOS_DEFAULTS.deviceOpTimeoutMs);
}

/** The surface the engine's mobile target runner needs. */
export interface MobileBuilder {
  ensureDevice(platform: MobilePlatform, options?: EnsureDeviceOptions): Promise<DeviceInfo>;
  build(projectDir: string, platform: MobilePlatform, options?: BuildOptions): Promise<BuildResult>;
}

export const MobileBuilder: MobileBuilder = {
  ensureDevice,
  build: buildExpo,
};
