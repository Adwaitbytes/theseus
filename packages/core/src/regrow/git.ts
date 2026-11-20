import { runChecked } from "../util/process.js";
import type { DiffStat } from "./loop.js";

/** Commits carry a fixed identity so workspaces do not depend on the operator's git config. */
const IDENTITY = ["-c", "user.name=Theseus", "-c", "user.email=theseus@users.noreply.github.com", "-c", "commit.gpgsign=false"];

function git(dir: string, args: readonly string[]): Promise<{ stdout: string }> {
  return runChecked("git", [...IDENTITY, ...args], { cwd: dir, timeoutMs: 60_000 });
}

export async function gitInit(dir: string): Promise<void> {
  await git(dir, ["init", "--quiet", "--initial-branch=main"]);
}

export function parseNumstat(numstat: string): DiffStat {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of numstat.split("\n")) {
    const [added, removed] = line.split("\t");
    if (added === undefined || removed === undefined) continue;
    files += 1;
    // Binary files report "-" for both counts.
    additions += added === "-" ? 0 : Number(added);
    deletions += removed === "-" ? 0 : Number(removed);
  }
  return { files, additions, deletions };
}

/** Stages everything and commits, even when nothing changed, so every round has a commit to point at. */
export async function gitCommitAll(dir: string, message: string): Promise<{ commit: string; diffStat: DiffStat }> {
  await git(dir, ["add", "--all"]);
  const staged = await git(dir, ["diff", "--cached", "--numstat"]);
  await git(dir, ["commit", "--quiet", "--allow-empty", "-m", message]);
  const head = await git(dir, ["rev-parse", "HEAD"]);
  return { commit: head.stdout.trim(), diffStat: parseNumstat(staged.stdout) };
}
