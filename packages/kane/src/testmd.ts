import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Behavior, Target } from "@theseus/schema";
import { buildObjective, kaneTargetFor } from "./command.js";
import { KaneTargetError } from "./errors.js";

/** JSON strings are valid YAML scalars, which keeps URLs, paths and titles safe without a YAML emitter. */
const scalar = (value: string): string => JSON.stringify(value);

function frontmatter(behavior: Behavior, target: Target): string[] {
  const lines = ["mode: testing"];
  const kaneTarget = kaneTargetFor(target);
  if (kaneTarget === "desktop") {
    if (target.url === undefined) throw new KaneTargetError(`Web target ${target.id} has no url`);
    lines.push(`url: ${scalar(target.url)}`);
  } else {
    if (target.app === undefined) throw new KaneTargetError(`${target.platform} target ${target.id} has no app`);
    // Flat keys only: the testmd parser refuses a nested `target: {platform, app}`.
    lines.push(`target: ${kaneTarget}`, `app: ${scalar(target.app)}`);
  }
  const tags = [...new Set(behavior.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];
  if (tags.length > 0) lines.push(`tags: [${tags.map(scalar).join(", ")}]`);
  return lines;
}

/** One committed `_test.md` per behavior (kane-cli skill, references/testmd.md and mobile.md). */
export function renderTestMd(behavior: Behavior, target: Target): string {
  return [
    "---",
    ...frontmatter(behavior, target),
    "---",
    "",
    `# ${behavior.title}`,
    "",
    `## ${behavior.title}`,
    buildObjective(behavior),
    "",
  ].join("\n");
}

export async function writeTestMdFiles(
  behaviors: readonly Behavior[],
  target: Target,
  outDir: string,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const behavior of behaviors) {
    const file = path.join(outDir, `${behavior.id}_test.md`);
    await writeFile(file, renderTestMd(behavior, target), "utf8");
    written.push(file);
  }
  return written;
}
