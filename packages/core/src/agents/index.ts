import type { AgentName } from "../config.js";
import { ClaudeCodeAgent } from "./claude-code.js";
import { CodexAgent } from "./codex.js";
import type { BuilderAgent } from "./types.js";

export type AgentFactory = (name: AgentName, model: string | undefined) => BuilderAgent;

export const createAgent: AgentFactory = (name, model) => {
  const options = model === undefined ? {} : { model };
  switch (name) {
    case "claude-code":
      return new ClaudeCodeAgent(options);
    case "codex":
      return new CodexAgent(options);
  }
};
