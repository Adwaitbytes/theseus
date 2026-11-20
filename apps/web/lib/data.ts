import "server-only";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { TheseusEvent, Voyage } from "@theseus/schema";
import type { Regrowth } from "@theseus/schema";

export interface LoadedVoyage {
  voyage: Voyage;
  events: TheseusEvent[];
  /** True when the data comes from the bundled fixture instead of a committed run. */
  sample: boolean;
  /** Absolute directory holding voyage.json, events.ndjson and artifacts/. */
  dir: string;
}

const FIXTURES_DIR = resolve(process.cwd(), "fixtures");

function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not find the repo root (pnpm-workspace.yaml) above ${start}`);
    dir = parent;
  }
  return dir;
}

const REPO_ROOT = findRepoRoot(process.cwd());
const RUNS_DIR = join(REPO_ROOT, "runs");

function parseVoyageDir(dir: string, sample: boolean): LoadedVoyage {
  const voyagePath = join(dir, "voyage.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(voyagePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${voyagePath}: ${(error as Error).message}`, { cause: error });
  }
  const parsed = Voyage.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid voyage at ${voyagePath}:\n${parsed.error.message}`);
  }

  const eventsPath = join(dir, "events.ndjson");
  const events: TheseusEvent[] = [];
  if (existsSync(eventsPath)) {
    const lines = readFileSync(eventsPath, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.trim() === "") return;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch (error) {
        throw new Error(`${eventsPath}:${i + 1} is not valid JSON: ${(error as Error).message}`, { cause: error });
      }
      const event = TheseusEvent.safeParse(json);
      if (!event.success) throw new Error(`${eventsPath}:${i + 1} is not a valid event:\n${event.error.message}`);
      events.push(event.data);
    });
  }
  return { voyage: parsed.data, events, sample, dir };
}

function voyageDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, "voyage.json")))
    .sort();
}

let cache: LoadedVoyage[] | undefined;

/**
 * Every voyage the site renders. Real runs under `runs/` win; the bundled fixture is used
 * only when there are none, and is flagged `sample` so pages can label it.
 */
export function loadVoyages(): LoadedVoyage[] {
  if (cache) return cache;
  const real = voyageDirs(RUNS_DIR).map((dir) => parseVoyageDir(dir, false));
  const loaded = real.length > 0 ? real : voyageDirs(FIXTURES_DIR).map((dir) => parseVoyageDir(dir, true));
  if (loaded.length === 0) throw new Error(`No voyages found in ${RUNS_DIR} or ${FIXTURES_DIR}`);
  const ids = new Set<string>();
  for (const { voyage } of loaded) {
    if (ids.has(voyage.id)) throw new Error(`Duplicate voyage id ${voyage.id}`);
    ids.add(voyage.id);
  }
  cache = loaded;
  return loaded;
}

/** The voyage featured on the home page: TodoMVC when present, otherwise the first one. */
export function heroVoyage(): LoadedVoyage {
  const all = loadVoyages();
  return all.find((v) => v.voyage.id.startsWith("todomvc")) ?? all[0]!;
}

export function getVoyage(id: string): LoadedVoyage | undefined {
  return loadVoyages().find((v) => v.voyage.id === id);
}

export function getRegrowth(loaded: LoadedVoyage, targetId: string): Regrowth | undefined {
  return loaded.voyage.regrowths.find((r) => r.target.id === targetId);
}

/**
 * Public URL for an artifact path stored in a Kane outcome, or undefined when the file
 * was not committed. scripts/sync-evidence.mjs copies runs/<id>/artifacts into public/evidence/<id>/.
 */
export function evidenceUrl(loaded: LoadedVoyage, relativePath: string | undefined): string | undefined {
  if (!relativePath || loaded.sample) return undefined;
  const normalized = relativePath.replace(/^\.?\/+/, "");
  if (normalized.includes("..")) return undefined;
  if (!existsSync(join(loaded.dir, normalized))) return undefined;
  return `/evidence/${loaded.voyage.id}/${normalized}`;
}

/**
 * Static params for the per-target routes. A static export must emit at least one route,
 * so before any regrowth exists a placeholder target is returned and its page renders 404.
 */
export function targetRouteParams(): { id: string; target: string }[] {
  const voyages = loadVoyages();
  const params = voyages.flatMap(({ voyage }) => voyage.regrowths.map((r) => ({ id: voyage.id, target: r.target.id })));
  if (params.length > 0) return params;
  const first = voyages[0];
  return first ? [{ id: first.voyage.id, target: "pending" }] : [];
}
