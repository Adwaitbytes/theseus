import { stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { TheseusError, parseConfig, renderConfigJson, synthesizeConfig, type RegrowRequest } from "@theseus/core";
import { runConfig, type PhaseOptions } from "./commands.js";

/** Where `theseus regrow <url>` keeps the config it synthesized, so the voyage can be resumed or edited. */
export const SYNTHESIZED_DIR = join(".theseus", "configs");

async function requireFiles(paths: readonly string[], cwd: string): Promise<void> {
  for (const path of paths) {
    try {
      if ((await stat(resolve(cwd, path))).isFile()) continue;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    throw new TheseusError("config-invalid", `--docs ${path} is not a file`);
  }
}

/** The command that reproduces a request, written into the config for provenance. */
export function commandFor(verb: "init" | "regrow", request: RegrowRequest): string {
  const parts = ["theseus", verb, request.url, "--to", request.to.join(",")];
  if (request.race !== undefined) parts.push("--race", request.race.join(","));
  if (request.agent !== undefined) parts.push("--agent", request.agent);
  for (const doc of request.docs ?? []) parts.push("--docs", doc);
  if (request.name !== undefined) parts.push("--name", request.name);
  if (request.budget !== undefined) parts.push("--budget", String(request.budget));
  if (request.rounds !== undefined) parts.push("--rounds", String(request.rounds));
  return parts.join(" ");
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

/** `theseus init <url>`: writes the config `theseus regrow <url>` would run, for editing first. */
export async function init(
  request: RegrowRequest,
  options: { readonly out: string; readonly force?: boolean },
  cwd: string = process.cwd(),
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<number> {
  await requireFiles(request.docs ?? [], cwd);
  const out = resolve(cwd, options.out);
  if (options.force !== true && (await exists(out))) {
    throw new TheseusError("config-invalid", `${options.out} already exists; pass --force to replace it`);
  }
  // Docs are stored relative to the config file, which is how the config resolves them.
  const docs = (request.docs ?? []).map((doc) => relative(dirname(out), resolve(cwd, doc)));
  const config = synthesizeConfig({ ...request, docs });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, renderConfigJson(config, commandFor("init", request)), "utf8");
  const shown = relative(cwd, out) || out;
  write(
    [
      `Wrote ${shown} (${config.targets.length} targets: ${config.targets.map((target) => target.id).join(", ")})`,
      "",
      "Next:",
      `  theseus doctor              check Kane, agents and devices`,
      `  theseus voyage ${shown}`,
      "",
    ].join("\n"),
  );
  return 0;
}

/** `theseus regrow <url> --to ...`: synthesizes a config, saves it for resuming, and runs the voyage. */
export async function regrowUrl(request: RegrowRequest, options: PhaseOptions, cwd: string = process.cwd()): Promise<number> {
  await requireFiles(request.docs ?? [], cwd);
  const config = synthesizeConfig({ ...request, docs: (request.docs ?? []).map((doc) => resolve(cwd, doc)) });
  const configPath = resolve(cwd, SYNTHESIZED_DIR, `${config.id}.json`);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, renderConfigJson(config, commandFor("regrow", request)), "utf8");
  if (options.json !== true) {
    process.stderr.write(`Config saved to ${relative(cwd, configPath)}; resume or edit it with theseus voyage ${relative(cwd, configPath)}\n`);
  }
  return runConfig(parseConfig(config, configPath, cwd), undefined, options);
}
