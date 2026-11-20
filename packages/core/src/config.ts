import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Platform } from "@theseus/schema";
import { z } from "zod";
import { TheseusError } from "./errors.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected kebab-case");

export const AgentName = z.enum(["claude-code", "codex"]);
export type AgentName = z.infer<typeof AgentName>;

export const TargetConfig = z.object({
  id: slug,
  label: z.string().min(1),
  platform: Platform,
  stack: z.string().min(2),
  agent: AgentName.default("claude-code"),
  model: z.string().optional(),
  /** Extra stack guidance appended to SPEC.md, for things the stack name alone does not pin down. */
  brief: z.string().optional(),
});
export type TargetConfig = z.infer<typeof TargetConfig>;

export const TheseusConfig = z
  .object({
    id: slug,
    title: z.string().min(1),
    app: z.object({ name: z.string().min(1), description: z.string().min(1) }),
    original: z.object({
      id: slug.default("original"),
      label: z.string().default("Original"),
      stack: z.string().min(2),
      url: z.string().url(),
      /** Source of the original, needed only for the strength phase. Relative to the config file. */
      source: z.string().optional(),
      /** Command that serves `source` on $PORT. Without it the source is served as static files. */
      start: z.string().optional(),
    }),
    /** Documentation files handed to the drafting agent. Relative to the config file. */
    docs: z.array(z.string()).default([]),
    targets: z.array(TargetConfig).min(1),
    rounds: z.number().int().min(1).max(20).default(5),
    /** Hard cap on Kane credits for the whole voyage, checked before every phase and round. */
    budgetCredits: z.number().positive().optional(),
    concurrency: z
      .object({
        web: z.number().int().min(1).max(8).default(2),
        mobile: z.number().int().min(1).max(2).default(1),
        targets: z.number().int().min(1).max(8).default(2),
      })
      .prefault({}),
    strength: z
      .object({
        enabled: z.boolean().default(true),
        mutants: z.number().int().min(1).max(30).default(8),
        /** A surviving mutant costs a Kane run per behavior tried; this caps that spend. */
        maxRunsPerMutant: z.number().int().min(1).default(5),
      })
      .prefault({}),
    kane: z
      .object({
        timeoutS: z.number().int().positive().default(300),
        maxSteps: z.number().int().positive().optional(),
        /** Estimate used by the budget guard before a phase starts; real runs cost about 20 to 21.5. */
        creditsPerRun: z.number().positive().default(21),
      })
      .prefault({}),
    /** Agent used for drafting behaviors and planting mutants. */
    draftAgent: z.object({ agent: AgentName.default("claude-code"), model: z.string().optional() }).prefault({}),
    /** Where voyages are written. Relative to the working directory. */
    runsDir: z.string().default("runs"),
    /** Where clean-room workspaces live. Relative to the working directory. */
    workDir: z.string().default(".theseus/work"),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>([config.original.id]);
    for (const [index, target] of config.targets.entries()) {
      if (seen.has(target.id)) {
        ctx.addIssue({ code: "custom", path: ["targets", index, "id"], message: `duplicate target id "${target.id}"` });
      }
      seen.add(target.id);
    }
  });
export type TheseusConfig = z.infer<typeof TheseusConfig>;

/** A config with every path made absolute, so nothing downstream depends on the process cwd. */
export interface ResolvedConfig extends TheseusConfig {
  readonly configPath: string;
  readonly runsDir: string;
  readonly workDir: string;
  readonly docs: string[];
  readonly original: TheseusConfig["original"];
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("\n");
}

export function parseConfig(json: unknown, configPath: string, cwd: string): ResolvedConfig {
  const parsed = TheseusConfig.safeParse(json);
  if (!parsed.success) {
    throw new TheseusError("config-invalid", `${configPath} is not a valid Theseus config:\n${formatZodIssues(parsed.error)}`);
  }
  const config = parsed.data;
  const configDir = dirname(resolve(cwd, configPath));
  const fromConfig = (path: string): string => (isAbsolute(path) ? path : resolve(configDir, path));
  const fromCwd = (path: string): string => (isAbsolute(path) ? path : resolve(cwd, path));
  const original =
    config.original.source === undefined
      ? config.original
      : { ...config.original, source: fromConfig(config.original.source) };
  return {
    ...config,
    configPath: resolve(cwd, configPath),
    original,
    docs: config.docs.map(fromConfig),
    runsDir: fromCwd(config.runsDir),
    workDir: fromCwd(config.workDir),
  };
}

export async function loadConfig(configPath: string, cwd: string = process.cwd()): Promise<ResolvedConfig> {
  let text: string;
  try {
    text = await readFile(resolve(cwd, configPath), "utf8");
  } catch (error) {
    throw new TheseusError("config-invalid", `cannot read config ${configPath}`, { cause: error });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new TheseusError("config-invalid", `${configPath} is not valid JSON`, { cause: error });
  }
  return parseConfig(json, configPath, cwd);
}
