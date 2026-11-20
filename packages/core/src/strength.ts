import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Behavior, Mutant, Spec, StrengthReport } from "@theseus/schema";
import { z } from "zod";
import { runJsonTask } from "./agents/json-task.js";
import { kaneContext, originTarget, type PhaseContext } from "./context.js";
import { TheseusError, errorMessage } from "./errors.js";
import { runOne } from "./kane/run.js";
import { defaultLauncher, type RunningApp } from "./regrow/launcher.js";
import { runProcess } from "./util/process.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected kebab-case");

export const MutantProposal = z.object({
  id: slug,
  description: z.string().min(10),
  /** The spec area the bug should show up in; used to try the most related behaviors first. */
  area: z.string(),
  patch: z.string().min(10),
});
export type MutantProposal = z.infer<typeof MutantProposal>;

export const MutationOutput = z.object({ mutants: z.array(MutantProposal).min(1) });

export const MUTANTS_FILE = "mutants.json";

export function buildMutationPrompt(count: number, spec: Spec): string {
  const areas = [...new Set(spec.behaviors.map((behavior) => behavior.area))];
  return [
    `This directory holds the source of "${spec.app.name}". Plant ${count} realistic bugs, the kind a developer could ship by mistake: off-by-one counts, wrong filter conditions, a missing trim, a lost save, a wrong label, an inverted toggle, an edit that is not committed. Each bug is a separate, single, small change to the app's own source (not to vendored libraries or minified files).`,
    "",
    "Each bug must be visible to a user of the app, so a behavioral test could catch it. Spread them across these feature areas:",
    ...areas.map((area) => `- ${area}`),
    "",
    `Write ${MUTANTS_FILE} in this directory as { "mutants": [ { "id": "kebab-case-id", "description": "one sentence on what breaks for the user", "area": "one of the areas above", "patch": "<unified diff>" } ] }.`,
    "Each patch is a unified diff relative to this directory (lines starting with ---/+++ using a/ and b/ prefixes) that `git apply` accepts on the unmodified source. Produce the diffs without leaving any change in the source files: if you edit a file to make a diff, restore it afterwards.",
  ].join("\n");
}

/** Behaviors in the mutant's area first, so a kill usually costs one Kane run. */
export function orderForMutant(behaviors: readonly Behavior[], area: string): Behavior[] {
  const key = area.trim().toLowerCase();
  const related = behaviors.filter((behavior) => behavior.area.trim().toLowerCase() === key);
  return [...related, ...behaviors.filter((behavior) => !related.includes(behavior))];
}

export function strengthScore(mutants: readonly Mutant[]): StrengthReport {
  const killed = mutants.filter((mutant) => mutant.killedBy.length > 0).length;
  return { mutants: [...mutants], killed, total: mutants.length, score: mutants.length === 0 ? 0 : killed / mutants.length };
}

async function applyPatch(dir: string, patch: string): Promise<string | undefined> {
  const file = join(dir, ".theseus-mutant.diff");
  await writeFile(file, patch.endsWith("\n") ? patch : `${patch}\n`, "utf8");
  const result = await runProcess("git", ["apply", "--whitespace=nowarn", file], { cwd: dir, timeoutMs: 30_000 });
  await rm(file, { force: true });
  return result.exitCode === 0 ? undefined : (result.stderr.trim() || `git apply exited with ${result.exitCode}`);
}

/**
 * Measures how much the spec can be trusted: an agent plants single-bug mutants
 * in a copy of the original, and each mutant is served and run against the spec
 * until a behavior fails (killed) or the per-mutant run cap is reached (survived).
 */
export async function strength(ctx: PhaseContext, spec: Spec): Promise<StrengthReport> {
  const { config, deps } = ctx;
  const source = config.original.source;
  if (source === undefined) throw new TheseusError("phase-precondition", "strength needs original.source in the config");
  const scratch = join(config.workDir, config.id, ".strength");
  const proposalDir = join(scratch, "proposal");
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await cp(source, proposalDir, { recursive: true });

  const origin = originTarget(config);
  const output = await runJsonTask({
    agent: deps.createAgent(config.draftAgent.agent, config.draftAgent.model),
    cwd: proposalDir,
    prompt: buildMutationPrompt(config.strength.mutants, spec),
    outputFile: MUTANTS_FILE,
    schema: MutationOutput,
    lint: (value) => {
      const ids = value.mutants.map((mutant) => mutant.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index).map((id) => `duplicate mutant id "${id}"`);
    },
    onOutput: (text) => deps.bus.emit({ type: "agent-output", targetId: origin.id, round: 1, text }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  });
  const proposals = output.mutants.slice(0, config.strength.mutants);
  const runsCap = config.strength.maxRunsPerMutant;
  ctx.ledger.ensure(proposals.length * Math.min(runsCap, spec.behaviors.length), "strength");

  const kane = kaneContext(ctx, "strength");
  const launcher = deps.launcher ?? defaultLauncher;
  const mutants: Mutant[] = [];
  for (const proposal of proposals) {
    const dir = join(scratch, proposal.id);
    await cp(source, dir, { recursive: true });
    const applyError = await applyPatch(dir, proposal.patch);
    if (applyError !== undefined) {
      deps.bus.log("warn", `mutant ${proposal.id} skipped: its patch does not apply (${applyError.split("\n")[0] ?? ""})`);
      continue;
    }
    let app: RunningApp;
    try {
      app = config.original.start === undefined ? await launcher.serveStatic(dir) : await launcher.launchCommand(dir, config.original.start);
    } catch (error) {
      deps.bus.log("warn", `mutant ${proposal.id} skipped: it does not start (${errorMessage(error)})`);
      continue;
    }
    const killedBy: string[] = [];
    try {
      const target = { ...origin, id: `${origin.id}-${proposal.id}`.slice(0, 60).replace(/-+$/, ""), url: app.url, original: false };
      for (const behavior of orderForMutant(spec.behaviors, proposal.area).slice(0, runsCap)) {
        const result = await runOne(kane, behavior, target, { round: 0, concurrency: 1, artifactsPath: join("strength", proposal.id), emit: false });
        if (result.outcome.status === "failed") {
          killedBy.push(behavior.id);
          break;
        }
      }
    } finally {
      await app.stop();
    }
    deps.bus.log(
      killedBy.length > 0 ? "info" : "warn",
      killedBy.length > 0 ? `mutant ${proposal.id} killed by ${killedBy[0] ?? ""}` : `mutant ${proposal.id} survived: ${proposal.description}`,
    );
    mutants.push({ id: proposal.id, description: proposal.description, patch: proposal.patch, killedBy });
  }
  const report = strengthScore(mutants);
  deps.bus.log("info", `strength: ${report.killed}/${report.total} planted bugs caught (${Math.round(report.score * 100)}%)`);
  return report;
}
