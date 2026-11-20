import type { AgentInfo } from "@theseus/schema";

export interface AgentRunInput {
  /** The only directory the agent may change. */
  readonly cwd: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
  /** Human-readable lines distilled from the agent's stream, for the TUI and the event log. */
  readonly onOutput: (text: string) => void;
}

export interface BuilderAgent {
  info(): Promise<AgentInfo>;
  run(input: AgentRunInput): Promise<{ exitCode: number }>;
}
