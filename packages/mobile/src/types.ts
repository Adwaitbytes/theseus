import type { OperationOptions } from "./system.js";

export type MobilePlatform = "android" | "ios";

export interface DeviceInfo {
  /** As Kane's `--device-name` expects it: the AVD name on Android, the simulator name on iOS. */
  readonly deviceName: string;
  /** As Kane's `--os-version` expects it, for example `16` or `27.2`. */
  readonly osVersion: string;
  /** adb serial (`emulator-5554`) or simulator UDID. */
  readonly deviceId: string;
}

export interface BuildResult {
  /** The artifact Kane's `--app` takes: an `.apk` for the emulator, a `.zip` of the `.app` for the simulator. */
  readonly appPath: string;
  /** Android package name or iOS bundle identifier. */
  readonly appId: string;
  readonly durationMs: number;
}

export interface EnsureDeviceOptions extends OperationOptions {
  /** AVD name or simulator name. Defaults to THESEUS_AVD / THESEUS_SIMULATOR, then a running device, then the first available. */
  readonly deviceName?: string;
  /** Boot without a window (Android `-no-window`; iOS skips opening Simulator.app). */
  readonly headless?: boolean;
  readonly bootTimeoutMs?: number;
}

export interface BuildOptions extends OperationOptions {
  readonly clean?: boolean;
  /** Android ABIs to compile native code for. Defaults to `arm64-v8a`, the only ABI Kane's local emulators run. */
  readonly androidAbis?: readonly string[];
  readonly buildTimeoutMs?: number;
}

export interface DeviceOperationOptions extends OperationOptions {
  /** adb serial or simulator UDID; defaults to the single running emulator or the booted simulator. */
  readonly deviceId?: string;
  readonly timeoutMs?: number;
}
