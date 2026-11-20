import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { formatZodIssues } from "../config.js";
import { TheseusError, errorMessage } from "../errors.js";
import type { BuilderAgent } from "./types.js";

export interface JsonTaskOptions<S extends z.ZodType> {
  readonly agent: BuilderAgent;
  readonly cwd: string;
  readonly prompt: string;
  /** File name, inside `cwd`, the agent must write its answer to. */
  readonly outputFile: string;
  readonly schema: S;
  /** Semantic checks beyond the schema; each returned string is one problem. */
  readonly lint?: (value: z.infer<S>) => string[];
  readonly onOutput: (text: string) => void;
  readonly signal?: AbortSignal;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; problems: string };

async function readAttempt<S extends z.ZodType>(options: JsonTaskOptions<S>): Promise<Attempt<z.infer<S>>> {
  let text: string;
  try {
    text = await readFile(join(options.cwd, options.outputFile), "utf8");
  } catch (error) {
    return { ok: false, problems: `You did not write ${options.outputFile} (${errorMessage(error)}).` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: `${options.outputFile} is not valid JSON: ${errorMessage(error)}` };
  }
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) return { ok: false, problems: `${options.outputFile} does not match the schema:\n${formatZodIssues(parsed.error)}` };
  const problems = options.lint?.(parsed.data) ?? [];
  if (problems.length > 0) return { ok: false, problems: problems.map((problem) => `- ${problem}`).join("\n") };
  return { ok: true, value: parsed.data };
}

/**
 * Runs an agent whose deliverable is a JSON file, validates it, and gives the agent
 * exactly one chance to fix what failed validation.
 */
export async function runJsonTask<S extends z.ZodType>(options: JsonTaskOptions<S>): Promise<z.infer<S>> {
  const run = async (prompt: string): Promise<Attempt<z.infer<S>>> => {
    const { exitCode } = await options.agent.run({
      cwd: options.cwd,
      prompt,
      onOutput: options.onOutput,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (exitCode !== 0) throw new TheseusError("agent-failed", `agent exited with ${exitCode} while writing ${options.outputFile}`);
    return readAttempt(options);
  };

  await rm(join(options.cwd, options.outputFile), { force: true });
  const first = await run(options.prompt);
  if (first.ok) return first.value;

  const retryPrompt = [
    options.prompt,
    "",
    `Your previous ${options.outputFile} was rejected. Fix every problem below and rewrite the whole file.`,
    first.problems,
  ].join("\n");
  const second = await run(retryPrompt);
  if (second.ok) return second.value;
  throw new TheseusError("agent-output-invalid", `${options.outputFile} was still invalid after one retry:\n${second.problems}`);
}
