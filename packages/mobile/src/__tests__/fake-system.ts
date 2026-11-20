import type { CommandResult, CommandSpec, RunOptions } from "../exec.js";
import type { System } from "../system.js";

export type Responder = (spec: CommandSpec, options: RunOptions) => Partial<CommandResult> | Promise<Partial<CommandResult>>;

export interface FakeSystem extends System {
  /** Every command run, as `command arg1 arg2`, in order. */
  readonly calls: string[];
  readonly detached: CommandSpec[];
  /** File contents `readText` returns; tests may add entries while a run is in progress. */
  readonly texts: Record<string, string>;
  /** Advanced by `sleep`, so polling loops run instantly. */
  clock: number;
}

export const line = (spec: CommandSpec): string => [spec.command, ...spec.args].join(" ");

/**
 * A System whose commands are answered by `respond`. Unknown commands exit 0 with empty output.
 * `files` is the set of paths `exists` reports; `dirs` maps a directory to its entries.
 */
export function fakeSystem(
  respond: Responder,
  files: readonly string[] = [],
  dirs: Readonly<Record<string, readonly string[]>> = {},
  env: Readonly<Record<string, string>> = {},
): FakeSystem {
  const fake: FakeSystem = {
    calls: [],
    detached: [],
    texts: {},
    clock: 0,
    run: async (spec, options) => {
      fake.calls.push(line(spec));
      const result = await respond(spec, options);
      const stdout = result.stdout ?? "";
      return { exitCode: result.exitCode ?? 0, stdout, stderr: result.stderr ?? "", stdoutBytes: result.stdoutBytes ?? Buffer.from(stdout) };
    },
    spawnDetached: async (spec) => {
      fake.detached.push(spec);
    },
    sleep: async (ms) => {
      fake.clock += ms;
    },
    now: () => fake.clock,
    exists: (path) => files.includes(path),
    listDir: (path) => dirs[path] ?? [],
    readText: (path) => fake.texts[path],
    env,
    homeDir: "/home/test",
  };
  return fake;
}
