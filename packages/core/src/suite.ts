import { join } from "node:path";
import type { Target } from "@theseus/schema";
import type { VoyagePaths } from "./voyage/store.js";

/**
 * Where a regrown web app is expected when its committed suite runs: `npm run start` with the
 * default PORT from the build contract. `theseus suite --url` points the suite elsewhere.
 */
export const SUITE_WEB_URL = "http://localhost:3000";

/** The committed Kane-native suite for one target: `runs/<id>/spec/<target>/`. */
export function suiteDir(paths: VoyagePaths, targetId: string): string {
  return join(paths.spec, targetId);
}

/** A mobile build next to the suite, by convention, so the committed files hold no machine paths. */
export function conventionalAppPath(target: Target): string {
  return `builds/${target.id}.${target.platform === "ios" ? "zip" : "apk"}`;
}

/** The target as its committed suite addresses it: a stable URL or app path instead of a launch-time one. */
export function suiteTarget(target: Target, override: { readonly url?: string; readonly app?: string } = {}): Target {
  if (target.platform === "web") return { ...target, url: override.url ?? SUITE_WEB_URL };
  return { ...target, app: override.app ?? conventionalAppPath(target) };
}
