import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { KaneOutcome } from "@theseus/schema";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { openPack, type PackReader } from "./pack.js";

/**
 * Evidence pack handling (kane-cli skill, references/evidence.md and debug.md; failure record shapes
 * from the evidence-cli L1 schemas shipped with kane-cli 0.10.7).
 */

const HINT = /evidence: view locally with `kane-cli evidence serve ([^`]+)`/g;

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/** The pack path from Kane's stderr hint; the last hint wins when a retry printed several. */
export function packPathFromStderr(stderr: string): string | undefined {
  let last: string | undefined;
  for (const match of stderr.matchAll(HINT)) last = match[1]?.trim();
  return last;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function newestPackIn(dir: string): Promise<string | undefined> {
  if (!(await exists(dir))) return undefined;
  let newest: { path: string; mtimeMs: number } | undefined;
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".evidence")) continue;
    const full = path.join(dir, name);
    const { mtimeMs } = await stat(full);
    if (newest === undefined || mtimeMs > newest.mtimeMs) newest = { path: full, mtimeMs };
  }
  return newest?.path;
}

/**
 * Finds the run's pack: the stderr hint, then the `coverage` event's `pack`, then the newest pack
 * under `<session_dir>/evidence/`.
 */
export async function locatePack(input: {
  readonly stderr: string;
  readonly coveragePack?: string | undefined;
  readonly sessionDir?: string | undefined;
  readonly cwd: string;
}): Promise<string | undefined> {
  for (const candidate of [packPathFromStderr(input.stderr), input.coveragePack]) {
    if (candidate === undefined) continue;
    const resolved = path.resolve(input.cwd, expandHome(candidate));
    if (await exists(resolved)) return resolved;
  }
  if (input.sessionDir !== undefined) {
    return newestPackIn(path.join(path.resolve(input.cwd, expandHome(input.sessionDir)), "evidence"));
  }
  return undefined;
}

const FailureIndex = z.looseObject({
  failures: z
    .array(z.looseObject({ path: z.string(), status: z.string().optional(), ordinal: z.number().optional() }))
    .catch([]),
});

const FailureRecord = z.looseObject({
  error: z.looseObject({ message: z.string().optional() }).optional().catch(undefined),
  triage: z
    .looseObject({
      rca: z
        .looseObject({ root_cause: z.string().optional(), category: z.string().optional() })
        .optional()
        .catch(undefined),
      suggested_fix: z.looseObject({ summary: z.string().optional() }).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const STEP_FILE = /^(.*?)tests\/([^/]+)\/steps\/(\d+)-([^/]+)\/([^/]+)$/;
const IMAGE = /^(screenshot|annotated)\.(png|jpe?g|webp)$/i;

interface StepDir {
  readonly dir: string;
  readonly ordinal: number;
  readonly files: Map<string, string>;
}

/** Groups `tests/<id>/steps/<ordinal>-<id>/<file>` entries by step folder, in ordinal order. */
function stepDirs(entries: readonly string[]): StepDir[] {
  const byDir = new Map<string, StepDir>();
  for (const entry of entries) {
    const match = STEP_FILE.exec(entry);
    if (match === null) continue;
    const [, prefix = "", test = "", ordinal = "0", step = "", file = ""] = match;
    const dir = `${prefix}tests/${test}/steps/${ordinal}-${step}`;
    const existing = byDir.get(dir) ?? { dir, ordinal: Number(ordinal), files: new Map<string, string>() };
    existing.files.set(file.toLowerCase(), entry);
    byDir.set(dir, existing);
  }
  return [...byDir.values()].sort((a, b) => a.ordinal - b.ordinal);
}

function image(step: StepDir, kind: "screenshot" | "annotated"): string | undefined {
  for (const [file, entry] of step.files) {
    const match = IMAGE.exec(file);
    if (match?.[1] === kind) return entry;
  }
  return undefined;
}

async function readYaml(pack: PackReader, entry: string): Promise<unknown> {
  const bytes = await pack.read(entry);
  return bytes === undefined ? undefined : parseYaml(new TextDecoder().decode(bytes));
}

/** The pack root may sit under a folder inside the zip; `run.yaml` marks it. */
function rootPrefix(entries: readonly string[]): string {
  const manifest = entries.find((entry) => entry === "run.yaml" || entry.endsWith("/run.yaml"));
  return manifest === undefined ? "" : manifest.slice(0, -"run.yaml".length);
}

/** The step that failed, from the run-level failure index, else the last step with its own failure record. */
async function failedStep(pack: PackReader, steps: readonly StepDir[]): Promise<StepDir | undefined> {
  const prefix = rootPrefix(pack.entries);
  const index = FailureIndex.safeParse(await readYaml(pack, `${prefix}failure.yaml`));
  if (index.success) {
    const row = index.data.failures.find((r) => r.status !== "passed" && r.status !== "skipped");
    if (row !== undefined) {
      const dir = `${prefix}${path.posix.dirname(row.path)}`;
      const step = steps.find((s) => s.dir === dir);
      if (step !== undefined) return step;
    }
  }
  return [...steps].reverse().find((s) => s.files.has("failure.yaml"));
}

export interface PackFindings {
  readonly finalShot?: string;
  readonly failShot?: string;
  readonly rca?: { readonly rootCause: string; readonly suggestedFix: string };
}

/** Picks the final and failing screenshots and the failure triage out of a pack, without copying anything. */
export async function analyzePack(pack: PackReader, failed: boolean): Promise<PackFindings> {
  const steps = stepDirs(pack.entries);
  const last = [...steps].reverse().find((s) => image(s, "screenshot") ?? image(s, "annotated"));
  const finalShot = last === undefined ? undefined : (image(last, "screenshot") ?? image(last, "annotated"));
  if (!failed) return finalShot === undefined ? {} : { finalShot };

  const step = await failedStep(pack, steps);
  const failShot = step === undefined ? undefined : (image(step, "annotated") ?? image(step, "screenshot"));
  const recordEntry = step?.files.get("failure.yaml");
  const record = recordEntry === undefined ? undefined : FailureRecord.safeParse(await readYaml(pack, recordEntry));
  const triage = record?.success ? record.data.triage : undefined;
  const cause = triage?.rca?.root_cause ?? (record?.success ? record.data.error?.message : undefined);
  // KaneOutcome.rca has no category field, so the family ("automation_bug" means the test was wrong,
  // anything else points at the product) rides as a prefix the engine can match on.
  const family = triage?.rca?.category?.split("/")[0]?.trim();
  const rootCause = cause === undefined || !family ? cause : `[${family}] ${cause}`;
  return {
    ...(finalShot === undefined ? {} : { finalShot }),
    ...(failShot === undefined ? {} : { failShot }),
    ...(rootCause === undefined ? {} : { rca: { rootCause, suggestedFix: triage?.suggested_fix?.summary ?? "" } }),
  };
}

export interface ExtractedEvidence {
  readonly artifacts: KaneOutcome["artifacts"];
  readonly rca?: { readonly rootCause: string; readonly suggestedFix: string };
  /** Problems worth surfacing in the outcome's reason; extraction never throws. */
  readonly warnings: readonly string[];
}

function relativeTo(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

async function copyEntry(pack: PackReader, entry: string, destination: string): Promise<string> {
  const bytes = await pack.read(entry);
  if (bytes === undefined) throw new Error(`pack entry ${entry} vanished while reading`);
  const file = `${destination}${path.posix.extname(entry).toLowerCase()}`;
  await writeFile(file, bytes);
  return file;
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Copies the final screenshot and, on failure, the failing step's screenshot (annotated when present)
 * into `artifactsDir`, returning paths relative to `artifactsRoot`.
 *
 * The pack itself is never copied: its result.yaml and logs carry the signed-in user's email and org
 * ids, and artifacts are committed publicly. `evidencePack` is the original absolute path, recorded only
 * when the pack lives outside `artifactsRoot`, so a local viewer can still open it.
 */
export async function extractEvidence(input: {
  readonly packPath: string | undefined;
  readonly failed: boolean;
  readonly artifactsDir: string;
  readonly artifactsRoot: string;
  readonly baseName: string;
}): Promise<ExtractedEvidence> {
  if (input.packPath === undefined) {
    return { artifacts: {}, warnings: ["Evidence pack not found; no screenshots were saved."] };
  }
  try {
    await mkdir(input.artifactsDir, { recursive: true });
    const pack = await openPack(input.packPath);
    const findings = await analyzePack(pack, input.failed);
    const artifacts: { finalShot?: string; failShot?: string; evidencePack?: string } = {};
    const warnings: string[] = [];

    if (findings.finalShot !== undefined) {
      const file = await copyEntry(pack, findings.finalShot, path.join(input.artifactsDir, `${input.baseName}-final`));
      artifacts.finalShot = relativeTo(input.artifactsRoot, file);
    } else {
      warnings.push("Evidence pack has no step screenshots.");
    }
    if (findings.failShot !== undefined) {
      const file = await copyEntry(pack, findings.failShot, path.join(input.artifactsDir, `${input.baseName}-fail`));
      artifacts.failShot = relativeTo(input.artifactsRoot, file);
    }

    if (!isInside(input.artifactsRoot, input.packPath)) artifacts.evidencePack = path.resolve(input.packPath);

    return { artifacts, ...(findings.rca === undefined ? {} : { rca: findings.rca }), warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { artifacts: {}, warnings: [`Evidence pack at ${input.packPath} could not be read: ${message}`] };
  }
}
