import { readdir } from "node:fs/promises";
import path from "node:path";
import type { RunSuiteOptions, SuiteResult } from "./contract.js";
import { KaneSuiteError } from "./errors.js";
import { runKaneProcess } from "./process.js";
import { buildTestrunArgs, memberOf, parseTestrunLine, summarizeSuite } from "./testrun.js";

const DEFAULT_SUITE_TIMEOUT_S = 3_600;
const TEST_FILE = /_test\.md$/;

async function suiteFiles(dir: string, files: readonly string[] | undefined): Promise<string[]> {
  if (files !== undefined) {
    const invalid = files.filter((file) => !TEST_FILE.test(file));
    if (invalid.length > 0) throw new KaneSuiteError(`suite members must end in _test.md: ${invalid.join(", ")}`);
    if (files.length === 0) throw new KaneSuiteError("no suite members given");
    return [...files];
  }
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    throw new KaneSuiteError(`cannot read suite directory ${dir}`, { cause: error });
  }
  const found = entries.filter((entry) => TEST_FILE.test(entry)).sort();
  if (found.length === 0) throw new KaneSuiteError(`no _test.md files in ${dir}`);
  return found;
}

/**
 * Runs `kane-cli testrun run <files> --agent` in the suite directory. Files are passed explicitly
 * (relative to `dir`) so a stray `_test.md` elsewhere under the cwd never joins the plan.
 */
export async function runKaneSuite(bin: string, env: NodeJS.ProcessEnv, options: RunSuiteOptions): Promise<SuiteResult> {
  const dir = path.resolve(options.dir);
  const files = await suiteFiles(dir, options.files);
  const args = buildTestrunArgs(files, {
    parallel: options.parallel,
    headless: options.headless,
    name: options.name,
    onFailure: options.onFailure,
    device: options.device,
  });
  const { onMember } = options;
  const result = await runKaneProcess({
    bin,
    args,
    cwd: dir,
    env,
    timeoutMs: (options.timeoutS ?? DEFAULT_SUITE_TIMEOUT_S) * 1000,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(onMember === undefined
      ? {}
      : {
          onLine: (line: string) => {
            const event = parseTestrunLine(line);
            if (event?.kind === "member_start") onMember({ kind: "start", path: event.event.path });
            if (event?.kind === "member_end") onMember({ kind: "end", member: memberOf(event.event) });
          },
        }),
  });
  return summarizeSuite(result);
}
