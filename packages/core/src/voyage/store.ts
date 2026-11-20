import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Voyage } from "@theseus/schema";
import { z } from "zod";
import { formatZodIssues } from "../config.js";
import { TheseusError } from "../errors.js";
import { sanitizeForPersistence } from "../sanitize.js";

export interface VoyagePaths {
  readonly root: string;
  readonly voyageJson: string;
  readonly events: string;
  readonly credits: string;
  readonly artifacts: string;
  readonly spec: string;
}

export function voyagePaths(runsDir: string, voyageId: string): VoyagePaths {
  const root = join(runsDir, voyageId);
  return {
    root,
    voyageJson: join(root, "voyage.json"),
    events: join(root, "events.ndjson"),
    credits: join(root, "credits.json"),
    artifacts: join(root, "artifacts"),
    spec: join(root, "spec"),
  };
}

/** Write-then-rename so a crash never leaves a half-written file behind. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function readJsonIfExists(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new TheseusError("file-invalid", `${file} is not valid JSON`, { cause: error });
  }
}

export async function readVoyage(file: string): Promise<Voyage | undefined> {
  const json = await readJsonIfExists(file);
  if (json === undefined) return undefined;
  const parsed = Voyage.safeParse(json);
  if (!parsed.success) throw new TheseusError("file-invalid", `${file} is not a valid Voyage:\n${formatZodIssues(parsed.error)}`);
  return parsed.data;
}

export async function writeVoyage(file: string, voyage: Voyage): Promise<void> {
  // Validate on the way out too: everything under runs/ must parse for the website.
  await writeJsonAtomic(file, Voyage.parse(sanitizeForPersistence(voyage)));
}

export const CreditsFile = z.object({
  used: z.number().nonnegative(),
  budget: z.number().nonnegative().optional(),
  updatedAt: z.string().datetime(),
});
export type CreditsFile = z.infer<typeof CreditsFile>;

export async function readCredits(file: string): Promise<CreditsFile | undefined> {
  const json = await readJsonIfExists(file);
  if (json === undefined) return undefined;
  const parsed = CreditsFile.safeParse(json);
  if (!parsed.success) throw new TheseusError("file-invalid", `${file} is not a valid credits file:\n${formatZodIssues(parsed.error)}`);
  return parsed.data;
}
