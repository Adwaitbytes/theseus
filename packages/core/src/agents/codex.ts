import type { AgentInfo } from "@theseus/schema";
import { runChecked, runProcess } from "../util/process.js";
import { parseCodexStreamLine } from "./stream.js";
import type { AgentRunInput, BuilderAgent } from "./types.js";

export interface CodexOptions {
  readonly binary?: string;
  readonly model?: string;
  readonly runner?: typeof runProcess;
}

/**
 * `workspace-write` confines writes to the working root; network stays on because
 * a builder must `npm install`. Approvals are off because nobody is there to answer.
 */
export function codexArgs(prompt: string, cwd: string, model: string | undefined): string[] {
  return [
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    cwd,
    "-c",
    "sandbox_workspace_write.network_access=true",
    "-c",
    "approval_policy=never",
    ...(model === undefined ? [] : ["--model", model]),
    prompt,
  ];
}

export class CodexAgent implements BuilderAgent {
  readonly #binary: string;
  readonly #model: string | undefined;
  readonly #runner: typeof runProcess;

  constructor(options: CodexOptions = {}) {
    this.#binary = options.binary ?? "codex";
    this.#model = options.model;
    this.#runner = options.runner ?? runProcess;
  }

  async info(): Promise<AgentInfo> {
    const result = await runChecked(this.#binary, ["--version"], { cwd: process.cwd(), timeoutMs: 30_000 });
    return {
      name: "codex",
      model: this.#model ?? "default",
      version: result.stdout.trim().split(/\s+/).at(-1) ?? "unknown",
    };
  }

  async run(input: AgentRunInput): Promise<{ exitCode: number }> {
    const result = await this.#runner(this.#binary, codexArgs(input.prompt, input.cwd, this.#model), {
      cwd: input.cwd,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      onStdoutLine: (line) => {
        for (const text of parseCodexStreamLine(line, input.cwd).lines) input.onOutput(text);
      },
    });
    if (result.exitCode !== 0) input.onOutput(`codex exited with ${result.exitCode}`);
    return { exitCode: result.exitCode };
  }
}
