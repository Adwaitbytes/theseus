import type { AgentInfo } from "@theseus/schema";
import { runChecked, runProcess } from "../util/process.js";
import { parseClaudeStreamLine } from "./stream.js";
import type { AgentRunInput, BuilderAgent } from "./types.js";

/**
 * Tools a builder needs and nothing more. File tools are confined to the working
 * directory by Claude Code itself; shell access is limited to package managers,
 * node and git. Anything else is denied rather than prompted (`--permission-prompts none`).
 */
export const CLAUDE_ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "MultiEdit",
  "Glob",
  "Grep",
  "TodoWrite",
  "Bash(npm *)",
  "Bash(pnpm *)",
  "Bash(npx *)",
  "Bash(node *)",
  "Bash(git *)",
  "Bash(ls *)",
  "Bash(mkdir *)",
] as const;

export interface ClaudeCodeOptions {
  readonly binary?: string;
  readonly model?: string;
  readonly runner?: typeof runProcess;
}

export function claudeCodeArgs(prompt: string, model: string | undefined): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
    "--permission-prompts",
    "none",
    "--allowedTools",
    ...CLAUDE_ALLOWED_TOOLS,
    // The clean room must not inherit the operator's MCP servers or saved sessions.
    "--strict-mcp-config",
    "--no-session-persistence",
    ...(model === undefined ? [] : ["--model", model]),
  ];
}

export class ClaudeCodeAgent implements BuilderAgent {
  readonly #binary: string;
  readonly #model: string | undefined;
  readonly #runner: typeof runProcess;
  #observedModel: string | undefined;

  constructor(options: ClaudeCodeOptions = {}) {
    this.#binary = options.binary ?? "claude";
    this.#model = options.model;
    this.#runner = options.runner ?? runProcess;
  }

  async info(): Promise<AgentInfo> {
    const result = await runChecked(this.#binary, ["--version"], { cwd: process.cwd(), timeoutMs: 30_000 });
    return {
      name: "claude-code",
      model: this.#observedModel ?? this.#model ?? "default",
      version: result.stdout.trim().split(/\s+/)[0] ?? "unknown",
    };
  }

  async run(input: AgentRunInput): Promise<{ exitCode: number }> {
    const result = await this.#runner(this.#binary, claudeCodeArgs(input.prompt, this.#model), {
      cwd: input.cwd,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      onStdoutLine: (line) => {
        const parsed = parseClaudeStreamLine(line, input.cwd);
        if (parsed.model !== undefined) this.#observedModel = parsed.model;
        for (const text of parsed.lines) input.onOutput(text);
      },
    });
    if (result.exitCode !== 0) {
      const tail = result.stderr.trim().split("\n").slice(-3).join(" ");
      if (tail !== "") input.onOutput(`claude exited with ${result.exitCode}: ${tail}`);
    }
    return { exitCode: result.exitCode };
  }
}
