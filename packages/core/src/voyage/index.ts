import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { BehaviorResult, Regrowth, Voyage } from "@theseus/schema";
import { baseline } from "../baseline.js";
import { capture } from "../capture/index.js";
import { webConcurrency, type ResolvedConfig } from "../config.js";
import { originTarget, type EngineDeps, type PhaseContext } from "../context.js";
import { TheseusError, errorMessage, isAbortError } from "../errors.js";
import { recordEvents } from "../events/recorder.js";
import { CreditLedger } from "../kane/budget.js";
import { latestResults } from "../kane/outcome.js";
import { computeParity } from "../parity.js";
import { regrowTarget } from "../regrow/index.js";
import { nextStep } from "../regrow/loop.js";
import { sanitizeForPersistence } from "../sanitize.js";
import { strength } from "../strength.js";
import { suiteDir, suiteTarget } from "../suite.js";
import { mapConcurrent } from "../util/concurrency.js";
import { readCredits, readVoyage, voyagePaths, writeVoyage, type VoyagePaths } from "./store.js";

export const PHASES = ["capture", "baseline", "strength", "regrow", "parity"] as const;
export type PhaseName = (typeof PHASES)[number];

export interface VoyageOptions {
  /** Phases to consider, in pipeline order. Defaults to all of them. */
  readonly phases?: readonly PhaseName[];
  /** Phases to redo even if voyage.json says they are complete. */
  readonly force?: readonly PhaseName[];
  /** Restrict regrow and parity to these target ids. */
  readonly targets?: readonly string[];
  /** Let the drafting agent rewrite behaviors Kane's RCA blames on the test. Defaults to true. */
  readonly redraft?: boolean;
  readonly signal?: AbortSignal;
}

/** Which phases voyage.json already records as complete; the basis for resuming. */
export function completedPhases(voyage: Voyage | undefined, config: ResolvedConfig): Set<PhaseName> {
  const done = new Set<PhaseName>();
  if (voyage === undefined) return done;
  done.add("capture");
  if (voyage.baseline.length > 0) done.add("baseline");
  if (voyage.strength !== undefined) done.add("strength");
  const regrowDone = config.targets.every((target) => {
    const regrowth = voyage.regrowths.find((candidate) => candidate.id === target.id);
    return regrowth !== undefined && nextStep(voyage.spec.behaviors, regrowth.rounds, config.rounds).kind === "done";
  });
  if (regrowDone) done.add("regrow");
  if (regrowDone && voyage.regrowths.every((regrowth) => regrowth.parity !== undefined)) done.add("parity");
  return done;
}

/** Serializes voyage.json writes; targets regrow concurrently and each persists after every round. */
class VoyageWriter {
  #voyage: Voyage | undefined;
  #chain: Promise<void> = Promise.resolve();
  readonly #file: string;

  constructor(file: string, voyage: Voyage | undefined) {
    this.#file = file;
    this.#voyage = voyage;
  }

  get current(): Voyage | undefined {
    return this.#voyage;
  }

  update(change: (voyage: Voyage | undefined) => Voyage): Promise<Voyage> {
    // Keep the in-memory copy identical to what is on disk, so a resumed run sees the same data.
    const next = sanitizeForPersistence(change(this.#voyage));
    this.#voyage = next;
    const write = this.#chain.then(() => writeVoyage(this.#file, next));
    // The chain itself must not stay rejected, or every later write would fail too; the caller still sees this error.
    this.#chain = write.catch(() => undefined);
    return write.then(() => next);
  }
}

function writeCreditsSync(file: string, used: number, budget: number | undefined): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ used, ...(budget === undefined ? {} : { budget }), updatedAt: new Date().toISOString() }, null, 2)}\n`);
  renameSync(temp, file);
}

function requireVoyage(voyage: Voyage | undefined, phase: PhaseName): Voyage {
  if (voyage === undefined) throw new TheseusError("phase-precondition", `${phase} needs a captured spec; run capture first`);
  return voyage;
}

/** The latest result per behavior; after a green regrowth that is the full regression pass. */
export function finalResultsOf(regrowth: Regrowth): BehaviorResult[] {
  return [...latestResults(regrowth.rounds.map((round) => round.results)).values()];
}

export async function runVoyage(config: ResolvedConfig, deps: EngineDeps, options: VoyageOptions = {}): Promise<Voyage> {
  const paths: VoyagePaths = voyagePaths(config.runsDir, config.id);
  const stopRecording = recordEvents(deps.bus, paths.events);
  try {
    const credits = await readCredits(paths.credits);
    const ledger = new CreditLedger({
      ...(config.budgetCredits === undefined ? {} : { budget: config.budgetCredits }),
      used: credits?.used ?? 0,
      perRunEstimate: config.kane.creditsPerRun,
      onChange: (used) => writeCreditsSync(paths.credits, used, config.budgetCredits),
    });
    const ctx: PhaseContext = { config, deps, paths, ledger, ...(options.signal === undefined ? {} : { signal: options.signal }) };
    const writer = new VoyageWriter(paths.voyageJson, await readVoyage(paths.voyageJson));
    const wanted = new Set(options.phases ?? PHASES);
    const forced = new Set(options.force ?? []);
    const done = completedPhases(writer.current, config);
    const shouldRun = (phase: PhaseName): boolean => wanted.has(phase) && (forced.has(phase) || !done.has(phase));
    const skip = (phase: PhaseName): void => {
      if (wanted.has(phase)) deps.bus.log("info", `${phase}: already complete in voyage.json, skipping (use --force-phase ${phase} to redo)`);
    };
    const targets = config.targets.filter((target) => options.targets === undefined || options.targets.includes(target.id));
    if (config.state !== undefined && config.concurrency.web > 1) {
      deps.bus.log(
        "info",
        `state: web Kane concurrency forced from ${config.concurrency.web} to ${webConcurrency(config)}; every run resets the shared seed with ${config.state.method} ${config.state.resetUrl}, so parallel runs would see each other's writes`,
      );
    }

    if (shouldRun("capture")) {
      deps.bus.emit({ type: "phase", phase: "capture", detail: config.original.url });
      const spec = await capture(ctx);
      // A new spec invalidates everything measured against the old one.
      await writer.update(() => ({ version: 1, id: config.id, title: config.title, spec, baseline: [], regrowths: [] }));
    } else skip("capture");

    if (shouldRun("baseline")) {
      const voyage = requireVoyage(writer.current, "baseline");
      deps.bus.emit({ type: "phase", phase: "baseline", detail: `${voyage.spec.behaviors.length} behaviors on the original` });
      const result = await baseline(ctx, voyage.spec, { redraft: options.redraft ?? true });
      await writer.update((current) => ({ ...requireVoyage(current, "baseline"), spec: result.spec, baseline: result.results }));
      await deps.kane.exportTestMd(result.spec.behaviors, originTarget(config), paths.spec);
    } else skip("baseline");

    if (shouldRun("strength")) {
      const voyage = requireVoyage(writer.current, "strength");
      if (!config.strength.enabled) deps.bus.log("info", "strength: disabled in config");
      else if (config.original.source === undefined) deps.bus.log("warn", "strength: skipped, original.source is not set");
      else {
        deps.bus.emit({ type: "phase", phase: "strength", detail: `${config.strength.mutants} planted bugs` });
        const report = await strength(ctx, voyage.spec);
        await writer.update((current) => ({ ...requireVoyage(current, "strength"), strength: report }));
      }
    } else skip("strength");

    if (shouldRun("regrow")) {
      const voyage = requireVoyage(writer.current, "regrow");
      if (voyage.baseline.length === 0) throw new TheseusError("phase-precondition", "regrow needs a baseline; run baseline first");
      deps.bus.emit({ type: "phase", phase: "regrow", detail: targets.map((target) => target.id).join(", ") });
      const failures: unknown[] = [];
      await mapConcurrent(targets, config.concurrency.targets, async (target) => {
        const previous = voyage.regrowths.find((regrowth) => regrowth.id === target.id);
        const existing = forced.has("regrow") ? undefined : previous;
        if (existing !== undefined && nextStep(voyage.spec.behaviors, existing.rounds, config.rounds).kind === "done") {
          deps.bus.log("info", `${target.id}: regrowth already complete, skipping`);
          return;
        }
        try {
          await regrowTarget(ctx, voyage.spec, target, {
            ...(existing === undefined ? {} : { existing }),
            persist: async (regrowth) => {
              await writer.update((current) => {
                const base = requireVoyage(current, "regrow");
                return { ...base, regrowths: [...base.regrowths.filter((r) => r.id !== regrowth.id), regrowth] };
              });
            },
          });
        } catch (error) {
          if (isAbortError(error)) throw error;
          // One target failing (a budget stop, a missing mobile builder) must not take down its siblings mid-round.
          deps.bus.log("error", `${target.id}: ${errorMessage(error)}`);
          failures.push(error);
        }
      });
      if (failures.length > 0) throw failures[0];
    } else skip("regrow");

    if (shouldRun("parity")) {
      const voyage = requireVoyage(writer.current, "parity");
      deps.bus.emit({ type: "phase", phase: "parity" });
      const ids = new Set(targets.map((target) => target.id));
      await writer.update((current) => {
        const base = requireVoyage(current, "parity");
        return {
          ...base,
          regrowths: base.regrowths.map((regrowth) => {
            if (!ids.has(regrowth.id)) return regrowth;
            const parity = computeParity(voyage.spec, voyage.baseline, finalResultsOf(regrowth), regrowth.id);
            deps.bus.log(
              "info",
              `${regrowth.id}: parity ${parity.summary.identical}/${parity.summary.total} identical, ${parity.summary.diverged} diverged, ${parity.summary.failed} failed`,
            );
            return { ...regrowth, parity };
          }),
        };
      });
      // The proof outlives the voyage: each target's suite is committed so Kane can replay it on its own.
      for (const regrowth of voyage.regrowths) {
        if (!ids.has(regrowth.id)) continue;
        const dir = suiteDir(paths, regrowth.id);
        await deps.kane.exportTestMd(voyage.spec.behaviors, suiteTarget(regrowth.target), dir);
        deps.bus.log("info", `${regrowth.id}: Kane suite written to ${relative(process.cwd(), dir) || dir}`);
      }
    } else skip("parity");

    deps.bus.emit({ type: "phase", phase: "done", detail: `${Math.round(ledger.used)} credits used` });
    return requireVoyage(writer.current, "parity");
  } finally {
    stopRecording();
  }
}

