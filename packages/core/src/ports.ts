/**
 * The engine's outward-facing seams. Kane and mobile builds are implemented in
 * their own packages; core only ever sees these interfaces.
 */
export type { KaneClient, KaneStepEvent, RunBehaviorOptions } from "@theseus/kane";

export type MobilePlatform = "android" | "ios";

export interface MobileBuilder {
  /** Builds the Expo project in `workdir` into an installable artifact (.apk or simulator .app). */
  buildExpo(workdir: string, platform: MobilePlatform): Promise<{ appPath: string }>;
  /** Boots the emulator or simulator if it is not already running. */
  ensureDevice(platform: MobilePlatform): Promise<void>;
}
