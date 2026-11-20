import path from "node:path";
import type { Behavior, Target } from "@theseus/schema";
import { KaneTargetError } from "./errors.js";

/** A device for local emulator or simulator runs; agent-mode runs exit 2 when none is set or saved. */
export interface DeviceSelection {
  readonly name: string;
  readonly osVersion: string;
}

export interface RunArgsOptions {
  readonly headless?: boolean | undefined;
  readonly maxSteps?: number | undefined;
  readonly bugDetection?: "off" | "continue" | undefined;
  readonly timeoutS: number;
  readonly device?: DeviceSelection | undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The behavior's objective, ending with a store instruction for every declared key it does not
 * already mention, so Kane puts each one in `final_state` for parity.
 */
export function buildObjective(behavior: Behavior): string {
  const objective = behavior.objective.trim();
  const missing = behavior.stores.filter((key) => !new RegExp(`\\b${escapeRegExp(key)}\\b`).test(objective));
  if (missing.length === 0) return objective;
  const instructions = missing.map((key) => `Store the ${key.replaceAll("_", " ")} as '${key}'.`);
  return `${objective}\n${instructions.join("\n")}`;
}

/** Uploaded app ids (`APP` plus 6 or more digits) pass through; local builds become absolute paths. */
function resolveApp(app: string): string {
  return /^APP\d{6,}$/.test(app) ? app : path.resolve(app);
}

function requireUrl(target: Target): string {
  if (target.url === undefined) throw new KaneTargetError(`Web target ${target.id} has no url`);
  return target.url;
}

function requireApp(target: Target): string {
  if (target.app === undefined) throw new KaneTargetError(`${target.platform} target ${target.id} has no app`);
  return target.app;
}

/** The Kane `--target` for a Theseus platform: local virtual devices, never real ones. */
export function kaneTargetFor(target: Target): "desktop" | "emulator" | "simulator" {
  switch (target.platform) {
    case "web":
      return "desktop";
    case "android":
      return "emulator";
    case "ios":
      return "simulator";
  }
}

/** Arguments for `kane-cli run`, verified against `kane-cli run --help` on 0.10.7. */
export function buildRunArgs(objective: string, target: Target, options: RunArgsOptions): string[] {
  const kaneTarget = kaneTargetFor(target);
  // --target is always explicit: without it Kane falls back to a saved target, which could send a web run to a device.
  const args = ["run", objective, "--agent", "--mode", "testing", "--target", kaneTarget];
  if (kaneTarget === "desktop") {
    args.push("--url", requireUrl(target));
    // --headless only applies to Chrome; mobile runs drive a device.
    if (options.headless ?? true) args.push("--headless");
  } else {
    args.push("--app", resolveApp(requireApp(target)));
    if (options.device !== undefined) {
      args.push("--device-name", options.device.name, "--os-version", options.device.osVersion);
    }
  }
  args.push("--timeout", String(options.timeoutS));
  if (options.maxSteps !== undefined) args.push("--max-steps", String(options.maxSteps));
  if (options.bugDetection !== undefined) args.push("--bug-detection", options.bugDetection);
  return args;
}
