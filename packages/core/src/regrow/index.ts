import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Regrowth, Spec, Target } from "@theseus/schema";
import { webConcurrency, type TargetConfig } from "../config.js";
import { kaneContext, stateResetterFor, type PhaseContext } from "../context.js";
import { TheseusError, errorMessage, isAbortError } from "../errors.js";
import { systemClock } from "../events/bus.js";
import { runBehaviorSet } from "../kane/run.js";
import { readSeedDoc } from "../state.js";
import { gitCommitAll, gitInit } from "./git.js";
import { defaultLauncher } from "./launcher.js";
import { runRegrowLoop, type PreparedApp } from "./loop.js";
import { renderSpecMarkdown, type StateContract } from "./prompts.js";

const FEEDBACK_DIR = ".theseus-feedback";

const WORKSPACE_GITIGNORE = [
  "node_modules/",
  ".next/",
  ".svelte-kit/",
  "build/",
  "dist/",
  ".expo/",
  "android/",
  "ios/",
  ".testmuai/",
  `${FEEDBACK_DIR}/`,
  "*.log",
  "",
].join("\n");

export function workspaceDir(ctx: PhaseContext, targetId: string): string {
  return join(ctx.config.workDir, ctx.config.id, targetId);
}

export function captureScreensDir(ctx: PhaseContext): string {
  return join(ctx.paths.artifacts, "capture", "screens");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function stateContract(ctx: PhaseContext): Promise<StateContract | undefined> {
  const state = ctx.config.state;
  if (state === undefined) return undefined;
  const seed = await readSeedDoc(state.seedDoc);
  return { method: state.method, resetPath: state.resetUrl, seedDoc: seed.text };
}

/**
 * The clean room: SPEC.md and reference screenshots, nothing from the original's
 * source. Any previous workspace for this target is wiped first.
 */
export async function createCleanRoom(ctx: PhaseContext, spec: Spec, target: TargetConfig): Promise<string> {
  const dir = workspaceDir(ctx, target.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "reference"), { recursive: true });
  const screens = captureScreensDir(ctx);
  const references = (await exists(screens)) ? (await readdir(screens)).filter((file) => file.endsWith(".png")).sort() : [];
  for (const file of references) await copyFile(join(screens, file), join(dir, "reference", file));
  await writeFile(join(dir, "SPEC.md"), renderSpecMarkdown(spec, target, references, await stateContract(ctx)), "utf8");
  await writeFile(join(dir, ".gitignore"), WORKSPACE_GITIGNORE, "utf8");
  await gitInit(dir);
  await gitCommitAll(dir, "spec: clean room with SPEC.md and reference screenshots");
  return dir;
}

export function regrowTargetOf(config: TargetConfig): Target {
  return { id: config.id, label: config.label, platform: config.platform, stack: config.stack, original: false };
}

export async function regrowTarget(
  ctx: PhaseContext,
  spec: Spec,
  targetConfig: TargetConfig,
  options: { existing?: Regrowth; persist: (regrowth: Regrowth) => Promise<void> },
): Promise<Regrowth> {
  const { deps, config } = ctx;
  const target = regrowTargetOf(targetConfig);
  const dir = workspaceDir(ctx, target.id);
  const resuming = options.existing !== undefined && (await exists(join(dir, ".git")));
  if (!resuming) await createCleanRoom(ctx, spec, targetConfig);
  const agent = deps.createAgent(targetConfig.agent, targetConfig.model);
  const agentInfo = options.existing?.agent ?? (await agent.info());
  const launcher = deps.launcher ?? defaultLauncher;
  const kane = kaneContext(ctx, target.id);
  const concurrency = target.platform === "web" ? webConcurrency(config) : config.concurrency.mobile;
  const resetState = stateResetterFor(ctx);

  const prepareApp = async (round: number): Promise<PreparedApp> => {
    try {
      if (target.platform === "web") {
        const app = await launcher.launchNpmApp(dir, {
          ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
          onLog: (line) => deps.bus.emit({ type: "agent-output", targetId: target.id, round, text: line }),
        });
        const running: Target = { ...target, url: app.url };
        if (resetState !== undefined && config.state !== undefined) {
          try {
            await resetState(running);
          } catch (error) {
            await app.stop();
            if (isAbortError(error)) throw error;
            const endpoint = `${config.state.method} ${config.state.resetUrl}`;
            return {
              ok: false,
              error: `the app started but its reset failed: ${errorMessage(error)}\nImplement ${endpoint} that restores the seed in SPEC.md ("Data and reset contract") and answers 2xx in under 2 seconds.`,
            };
          }
        }
        return { ok: true, target: running, stop: () => app.stop() };
      }
      if (deps.mobile === undefined) {
        throw new TheseusError("phase-precondition", `target ${target.id} is ${target.platform} but no mobile builder is installed (@theseus/mobile)`);
      }
      await deps.mobile.ensureDevice(target.platform);
      const { appPath } = await deps.mobile.buildExpo(dir, target.platform);
      return { ok: true, target: { ...target, app: appPath }, stop: async () => {} };
    } catch (error) {
      if (isAbortError(error) || (error instanceof TheseusError && error.code === "phase-precondition")) throw error;
      return { ok: false, error: errorMessage(error) };
    }
  };

  return runRegrowLoop(
    {
      spec,
      targetConfig,
      target,
      agentInfo,
      workspace: dir,
      maxRounds: config.rounds,
      ...(options.existing === undefined || !resuming ? {} : { existing: options.existing }),
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    },
    {
      agent,
      bus: deps.bus,
      ledger: ctx.ledger,
      clock: systemClock,
      prepareApp,
      runBehaviors: (behaviors, runTarget, round) =>
        runBehaviorSet(kane, behaviors, runTarget, { round, concurrency, artifactsPath: join(target.id, `round-${round}`) }),
      commit: (message) => gitCommitAll(dir, message),
      stageFailShot: async (result, round) => {
        const shot = result.outcome.artifacts.failShot;
        if (shot === undefined) return undefined;
        const source = join(ctx.paths.root, shot);
        if (!(await exists(source))) return undefined;
        const relative = join(FEEDBACK_DIR, `round-${round}`, `${result.behaviorId}.png`);
        await mkdir(join(dir, FEEDBACK_DIR, `round-${round}`), { recursive: true });
        await copyFile(source, join(dir, relative));
        return relative;
      },
      persist: options.persist,
    },
  );
}
