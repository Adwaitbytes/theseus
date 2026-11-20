import { join } from "node:path";
import { MobileError } from "./errors.js";
import { type CommandSpec, runChecked, tailLines } from "./exec.js";
import { type Context, info, step } from "./system.js";
import type { MobilePlatform } from "./types.js";

export interface PrepareOptions {
  /** Regenerate the native directory from scratch (`expo prebuild --clean`). */
  readonly clean: boolean;
  readonly installTimeoutMs: number;
  readonly prebuildTimeoutMs: number;
}

export function assertExpoProject(ctx: Context, projectDir: string): void {
  if (!ctx.sys.exists(join(projectDir, "package.json"))) {
    throw new MobileError("invalid-project", `${projectDir} has no package.json`, "Point the build at the root of the Expo project.");
  }
  const hasConfig = ["app.json", "app.config.ts", "app.config.js"].some((name) => ctx.sys.exists(join(projectDir, name)));
  if (!hasConfig) {
    throw new MobileError(
      "invalid-project",
      `${projectDir} has no app.json or app.config.*`,
      "Add an app.json with expo.name, expo.android.package and expo.ios.bundleIdentifier.",
    );
  }
}

export function installCommand(projectDir: string, hasLockfile: boolean): CommandSpec {
  return { command: "npm", args: hasLockfile ? ["ci", "--no-audit", "--no-fund"] : ["install", "--no-audit", "--no-fund"], cwd: projectDir };
}

export function prebuildCommand(projectDir: string, platform: MobilePlatform, clean: boolean): CommandSpec {
  return {
    command: "npx",
    // Pods are installed separately so a CocoaPods failure is reported as such, not as a prebuild failure.
    args: ["expo", "prebuild", "--platform", platform, "--no-install", ...(clean ? ["--clean"] : [])],
    cwd: projectDir,
    env: { CI: "1", EXPO_NO_TELEMETRY: "1" },
  };
}

/** Installs JS dependencies when missing and generates the native project for one platform. */
export async function prepareNativeProject(
  ctx: Context,
  projectDir: string,
  platform: MobilePlatform,
  options: PrepareOptions,
): Promise<void> {
  assertExpoProject(ctx, projectDir);
  if (!ctx.sys.exists(join(projectDir, "node_modules", "expo"))) {
    const spec = installCommand(projectDir, ctx.sys.exists(join(projectDir, "package-lock.json")));
    info(ctx, "npm", `installing dependencies in ${projectDir}`);
    await runChecked(ctx.sys.run, spec, step(ctx, "npm", options.installTimeoutMs), (result) =>
      new MobileError("dependencies-failed", `npm exited with code ${result.exitCode} in ${projectDir}`, "Fix package.json so `npm install` succeeds; the log tail has npm's reason.", {
        logTail: tailLines(`${result.stdout}\n${result.stderr}`),
      }),
    );
  }
  info(ctx, "expo", `expo prebuild --platform ${platform}${options.clean ? " --clean" : ""}`);
  await runChecked(ctx.sys.run, prebuildCommand(projectDir, platform, options.clean), step(ctx, "expo", options.prebuildTimeoutMs), (result) =>
    new MobileError("prebuild-failed", `expo prebuild failed for ${platform}`, "Check app.json and config plugins; the log tail has Expo's reason.", {
      logTail: tailLines(`${result.stdout}\n${result.stderr}`),
    }),
  );
}
