import type { Platform } from "@theseus/schema";
import type { AgentName, TargetConfig } from "./config.js";
import { TheseusError } from "./errors.js";

/** A stack Theseus knows how to ask for: what `--to <id>` expands to in a synthesized config. */
export interface StackPreset {
  readonly id: string;
  readonly label: string;
  readonly platform: Platform;
  readonly stack: string;
  /** Stack-specific guidance for SPEC.md, for what the stack name alone does not pin down. */
  readonly brief?: string;
}

export const STACK_PRESETS: readonly StackPreset[] = [
  { id: "nextjs", label: "Next.js", platform: "web", stack: "Next.js (App Router, TypeScript)" },
  { id: "sveltekit", label: "SvelteKit", platform: "web", stack: "SvelteKit with adapter-node (TypeScript)" },
  {
    id: "nuxt",
    label: "Nuxt",
    platform: "web",
    stack: "Nuxt 3 with the node-server preset (Vue, TypeScript)",
    brief: "`npm run start` runs `node .output/server/index.mjs`, which reads PORT.",
  },
  {
    id: "react-router",
    label: "React Router",
    platform: "web",
    stack: "React Router 7 in framework mode (TypeScript)",
    brief: "`npm run start` runs `react-router-serve ./build/server/index.js`, which reads PORT.",
  },
  {
    id: "vite-react",
    label: "React + Vite",
    platform: "web",
    stack: "React with Vite (TypeScript, client-side only)",
    brief: "`npm run start` serves the production build with `vite preview --host 127.0.0.1 --port $PORT --strictPort`.",
  },
  {
    id: "angular",
    label: "Angular",
    platform: "web",
    stack: "Angular with standalone components (TypeScript)",
    brief: "`npm run start` serves the production build from dist/ on $PORT with a small Node static server; never `ng serve`.",
  },
  { id: "expo-android", label: "Expo on Android", platform: "android", stack: "Expo (React Native, TypeScript)" },
  { id: "expo-ios", label: "Expo on iOS", platform: "ios", stack: "Expo (React Native, TypeScript)" },
];

/** Short, id-safe agent names for race target ids such as `nextjs-claude`. */
export const AGENT_SLUG: Record<AgentName, string> = { "claude-code": "claude", codex: "codex" };
export const AGENT_LABEL: Record<AgentName, string> = { "claude-code": "Claude Code", codex: "Codex" };

export function findPreset(id: string): StackPreset | undefined {
  return STACK_PRESETS.find((preset) => preset.id === id);
}

export function requirePreset(id: string): StackPreset {
  const preset = findPreset(id);
  if (preset === undefined) {
    throw new TheseusError("config-invalid", `unknown stack "${id}"; known stacks: ${STACK_PRESETS.map((p) => p.id).join(", ")}`);
  }
  return preset;
}

function targetFor(preset: StackPreset, agent: AgentName, raced: boolean): TargetConfig {
  return {
    id: raced ? `${preset.id}-${AGENT_SLUG[agent]}` : preset.id,
    label: raced ? `${preset.label} (${AGENT_LABEL[agent]})` : preset.label,
    platform: preset.platform,
    stack: preset.stack,
    agent,
    ...(preset.brief === undefined ? {} : { brief: preset.brief }),
  };
}

/**
 * Expands stack ids into targets. With a race, every stack gets one target per agent, sharing the
 * stack and platform so the race summary can line them up; without one, every target uses `agent`.
 */
export function catalogTargets(stackIds: readonly string[], agents: readonly AgentName[]): TargetConfig[] {
  const unique = [...new Set(stackIds)];
  if (unique.length === 0) throw new TheseusError("config-invalid", "name at least one stack to regrow into");
  const distinctAgents = [...new Set(agents)];
  if (distinctAgents.length === 0) throw new TheseusError("config-invalid", "name at least one agent");
  const raced = distinctAgents.length > 1;
  return unique.flatMap((id) => {
    const preset = requirePreset(id);
    return distinctAgents.map((agent) => targetFor(preset, agent, raced));
  });
}
