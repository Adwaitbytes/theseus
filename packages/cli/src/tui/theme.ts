import type { CellState } from "./state.js";

/**
 * One small palette. Every state is also distinguishable by its glyph, so the
 * grid still reads under NO_COLOR or on a monochrome terminal.
 */
export const palette = {
  brand: "#7DD3FC",
  pass: "#4ADE80",
  fail: "#F87171",
  running: "#FBBF24",
  infra: "#A78BFA",
  muted: "gray",
} as const;

export type Tone = keyof typeof palette;

export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // https://no-color.org: any non-empty value disables color.
  return env.NO_COLOR === undefined || env.NO_COLOR === "";
}

export interface Paint {
  readonly color?: string;
  readonly dimColor?: boolean;
}

export function paint(tone: Tone | undefined, enabled: boolean): Paint {
  if (!enabled || tone === undefined) return {};
  if (tone === "muted") return { dimColor: true };
  return { color: palette[tone] };
}

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export const CELL_GLYPH: Record<Exclude<CellState, "running">, string> = {
  pending: "·",
  pass: "■",
  fail: "×",
  error: "!",
};

export const CELL_TONE: Record<CellState, Tone> = {
  pending: "muted",
  running: "running",
  pass: "pass",
  fail: "fail",
  error: "infra",
};

export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return width <= 3 ? text.slice(0, width) : `${text.slice(0, width - 3)}...`;
}

export function pad(text: string, width: number): string {
  // Columns always keep one space of gutter so adjacent cells never fuse.
  const cut = truncate(text, width - 1);
  return cut + " ".repeat(Math.max(0, width - cut.length));
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
