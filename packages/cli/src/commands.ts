import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  EventBus,
  TheseusError,
  errorMessage,
  isAbortError,
  loadConfig,
  readEvents,
  readVoyage,
  replayEvents,
  runVoyage,
  serveStatic,
  voyagePaths,
  type PhaseName,
  type ResolvedConfig,
} from "@theseus/core";
import type { Voyage } from "@theseus/schema";
import { createEngineDeps } from "./deps.js";
import { jsonSink, tuiSink, type EventSink } from "./sink.js";
import { seedFromVoyage, type ViewSeed } from "./tui/state.js";

export interface OutputOptions {
  readonly json?: boolean;
}

export interface PhaseOptions extends OutputOptions {
  readonly forcePhase?: PhaseName[];
  readonly target?: string[];
  readonly redraft?: boolean;
}

/** Exit codes: 0 done, 1 failed, 2 bad input, 3 out of budget, 130 interrupted. */
export function exitCodeFor(error: unknown): number {
  if (isAbortError(error)) return 130;
  if (error instanceof TheseusError) {
    if (error.code === "config-invalid" || error.code === "file-invalid" || error.code === "phase-precondition") return 2;
    if (error.code === "budget-exceeded") return 3;
  }
  return 1;
}

function seedFor(config: ResolvedConfig, voyage: Voyage | undefined): ViewSeed {
  const lanes = [
    { id: config.original.id, label: config.original.label, stack: config.original.stack, isOriginal: true },
    ...config.targets.map((target) => ({ id: target.id, label: target.label, stack: target.stack, isOriginal: false })),
  ];
  return {
    title: config.title,
    maxRounds: config.rounds,
    behaviors: voyage?.spec.behaviors.map((behavior) => behavior.id) ?? [],
    lanes,
  };
}

/** Ctrl-C aborts the engine cleanly instead of killing it mid-write. */
export function interruptSignal(): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onSigint = (): void => controller.abort(new TheseusError("aborted", "interrupted"));
  process.once("SIGINT", onSigint);
  return { signal: controller.signal, dispose: () => process.off("SIGINT", onSigint) };
}

export async function runPhases(configPath: string, phases: readonly PhaseName[] | undefined, options: PhaseOptions): Promise<number> {
  return runConfig(await loadConfig(configPath), phases, options);
}

export async function runConfig(config: ResolvedConfig, phases: readonly PhaseName[] | undefined, options: PhaseOptions): Promise<number> {
  const existing = await readVoyage(voyagePaths(config.runsDir, config.id).voyageJson);
  const sink: EventSink = options.json === true ? jsonSink() : tuiSink(seedFor(config, existing));
  const bus = new EventBus();
  bus.on((event) => sink.push(event));
  const { signal, dispose } = interruptSignal();
  const unknownTargets = (options.target ?? []).filter((id) => !config.targets.some((target) => target.id === id));
  try {
    if (unknownTargets.length > 0) {
      throw new TheseusError("config-invalid", `unknown target ${unknownTargets.join(", ")}; known: ${config.targets.map((t) => t.id).join(", ")}`);
    }
    const selected = config.targets.filter((target) => options.target === undefined || options.target.includes(target.id));
    const deps = await createEngineDeps(bus, selected.some((target) => target.platform !== "web"));
    const voyage = await runVoyage(config, deps, {
      ...(phases === undefined ? {} : { phases }),
      ...(options.forcePhase === undefined ? {} : { force: options.forcePhase }),
      ...(options.target === undefined ? {} : { targets: options.target }),
      ...(options.redraft === undefined ? {} : { redraft: options.redraft }),
      signal,
    });
    await sink.finish({ voyage });
    return 0;
  } catch (error) {
    await sink.finish({ error: errorMessage(error) });
    if (options.json === true) process.stderr.write(`theseus: ${errorMessage(error)}\n`);
    return exitCodeFor(error);
  } finally {
    dispose();
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** Accepts a run directory or an events.ndjson path; with neither, picks the newest recorded run under ./runs. */
export async function resolveRecording(input: string | undefined, cwd: string = process.cwd()): Promise<{ events: string; dir: string }> {
  if (input !== undefined) {
    const path = resolve(cwd, input);
    if (await isFile(path)) return { events: path, dir: dirname(path) };
    const events = join(path, "events.ndjson");
    if (await isFile(events)) return { events, dir: path };
    throw new TheseusError("file-invalid", `no events.ndjson at ${input}`);
  }
  const runs = resolve(cwd, "runs");
  let entries: string[];
  try {
    entries = await readdir(runs);
  } catch (error) {
    throw new TheseusError("file-invalid", "no recording given and ./runs does not exist; pass runs/<voyage-id>", { cause: error });
  }
  const candidates: { dir: string; mtime: number }[] = [];
  for (const entry of entries) {
    const events = join(runs, entry, "events.ndjson");
    if (await isFile(events)) candidates.push({ dir: join(runs, entry), mtime: (await stat(events)).mtimeMs });
  }
  const newest = candidates.sort((a, b) => b.mtime - a.mtime)[0];
  if (newest === undefined) throw new TheseusError("file-invalid", "no recorded voyage under ./runs; pass runs/<voyage-id>");
  return { events: join(newest.dir, "events.ndjson"), dir: newest.dir };
}

export async function demo(input: string | undefined, options: OutputOptions & { speed: number }): Promise<number> {
  const recording = await resolveRecording(input);
  const events = await readEvents(recording.events);
  const voyage = await readVoyage(join(recording.dir, "voyage.json"));
  // voyage.json does not record the round cap, so the replay shows plain round numbers.
  const seed: ViewSeed = voyage === undefined ? { title: basename(recording.dir) } : seedFromVoyage(voyage);
  const sink = options.json === true ? jsonSink() : tuiSink(seed);
  const { signal, dispose } = interruptSignal();
  try {
    await replayEvents(events, (event) => sink.push(event), { timing: { speed: options.speed, maxGapMs: 1200 }, signal });
    await sink.finish(voyage === undefined ? {} : { voyage });
    return 0;
  } catch (error) {
    await sink.finish({ error: errorMessage(error) });
    return exitCodeFor(error);
  } finally {
    dispose();
  }
}

export async function serve(dir: string, options: { port: number; host: string }): Promise<number> {
  const root = resolve(dir);
  if (!(await stat(root)).isDirectory()) throw new TheseusError("config-invalid", `${dir} is not a directory`);
  const server = await serveStatic(root, options.port, options.host);
  process.stdout.write(`serving ${root}\n  ${server.url}\npress ctrl-c to stop\n`);
  await new Promise<void>((resolveStop) => process.once("SIGINT", () => resolveStop()));
  await server.close();
  return 0;
}
