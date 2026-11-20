import { relative, isAbsolute } from "node:path";
import { z } from "zod";

/**
 * Agents stream rich JSON; the TUI wants one short line per meaningful act. These
 * parsers keep only what a person watching would care about and ignore the rest,
 * because both CLIs add event types between releases.
 */

const MAX_LINE = 240;

function compact(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > MAX_LINE ? `${single.slice(0, MAX_LINE - 3)}...` : single;
}

function displayPath(path: string, cwd: string): string {
  if (!isAbsolute(path)) return path;
  const rel = relative(cwd, path);
  return rel === "" || rel.startsWith("..") ? path : rel;
}

function parseJsonLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Agents occasionally interleave plain diagnostics with JSON; those lines are not events.
    return undefined;
  }
}

const ClaudeToolUse = z.object({
  type: z.literal("tool_use"),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
});
const ClaudeText = z.object({ type: z.literal("text"), text: z.string() });
const ClaudeEvent = z.union([
  z.object({ type: z.literal("system"), subtype: z.literal("init"), model: z.string() }),
  z.object({
    type: z.literal("assistant"),
    message: z.object({ content: z.array(z.union([ClaudeToolUse, ClaudeText, z.looseObject({ type: z.string() })])) }),
  }),
  z.object({
    type: z.literal("result"),
    subtype: z.string(),
    is_error: z.boolean().default(false),
    num_turns: z.number().optional(),
    duration_ms: z.number().optional(),
  }),
]);

function describeClaudeTool(name: string, input: Record<string, unknown>, cwd: string): string {
  const str = (key: string): string | undefined => {
    const value = input[key];
    return typeof value === "string" ? value : undefined;
  };
  const path = str("file_path") ?? str("path") ?? str("notebook_path");
  switch (name) {
    case "Bash":
      return `$ ${compact(str("command") ?? "")}`;
    case "Write":
      return `write ${displayPath(path ?? "?", cwd)}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `edit ${displayPath(path ?? "?", cwd)}`;
    case "Read":
      return `read ${displayPath(path ?? "?", cwd)}`;
    case "Glob":
    case "Grep":
      return `${name.toLowerCase()} ${compact(str("pattern") ?? "")}`;
    default:
      return name.toLowerCase();
  }
}

export interface ParsedAgentLine {
  readonly lines: string[];
  readonly model?: string;
}

export function parseClaudeStreamLine(line: string, cwd: string): ParsedAgentLine {
  const parsed = ClaudeEvent.safeParse(parseJsonLine(line));
  if (!parsed.success) return { lines: [] };
  const event = parsed.data;
  if (event.type === "system") return { lines: [], model: event.model };
  if (event.type === "result") {
    const seconds = event.duration_ms === undefined ? "" : ` in ${Math.round(event.duration_ms / 1000)}s`;
    return { lines: [`${event.is_error ? "agent stopped with an error" : "agent finished"}${seconds}`] };
  }
  const lines: string[] = [];
  for (const block of event.message.content) {
    const tool = ClaudeToolUse.safeParse(block);
    if (tool.success) {
      lines.push(describeClaudeTool(tool.data.name, tool.data.input, cwd));
      continue;
    }
    const text = ClaudeText.safeParse(block);
    if (text.success && text.data.text.trim() !== "") lines.push(compact(text.data.text));
  }
  return { lines };
}

const CodexItem = z.union([
  z.object({ type: z.literal("agent_message"), text: z.string() }),
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("command_execution"), command: z.string(), exit_code: z.number().nullable().optional() }),
  z.object({ type: z.literal("file_change"), changes: z.array(z.object({ path: z.string(), kind: z.string() })) }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.looseObject({ type: z.string() }),
]);
const CodexEvent = z.union([
  z.object({ type: z.literal("item.completed"), item: CodexItem }),
  z.object({ type: z.literal("turn.failed"), error: z.object({ message: z.string() }).optional() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.looseObject({ type: z.string() }),
]);

/** Codex wraps shell commands as `/bin/zsh -lc '<cmd>'`; show only the command. */
function unwrapShell(command: string): string {
  const match = /^\S*sh -lc '(.*)'$/s.exec(command);
  return match?.[1] ?? command;
}

export function parseCodexStreamLine(line: string, cwd: string): ParsedAgentLine {
  const parsed = CodexEvent.safeParse(parseJsonLine(line));
  if (!parsed.success) return { lines: [] };
  const event = parsed.data;
  if (event.type === "turn.failed") {
    const failed = z.object({ error: z.object({ message: z.string() }).optional() }).parse(event);
    return { lines: [`agent stopped with an error: ${compact(failed.error?.message ?? "unknown")}`] };
  }
  if (event.type === "error") {
    const failed = z.object({ message: z.string() }).safeParse(event);
    return { lines: failed.success ? [`error: ${compact(failed.data.message)}`] : [] };
  }
  if (event.type !== "item.completed") return { lines: [] };
  const item = z.object({ item: CodexItem }).parse(event).item;
  switch (item.type) {
    case "agent_message": {
      const text = z.object({ text: z.string() }).parse(item).text;
      return { lines: text.trim() === "" ? [] : [compact(text)] };
    }
    case "command_execution": {
      const command = z.object({ command: z.string() }).parse(item).command;
      return { lines: [`$ ${compact(unwrapShell(command))}`] };
    }
    case "file_change": {
      const changes = z.object({ changes: z.array(z.object({ path: z.string(), kind: z.string() })) }).parse(item).changes;
      return {
        lines: changes.map((change) => `${change.kind === "add" ? "write" : "edit"} ${displayPath(change.path, cwd)}`),
      };
    }
    default:
      return { lines: [] };
  }
}
