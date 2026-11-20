import type { ParityVerdict, Platform } from "@theseus/schema";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatInt = (n: number) => integer.format(n);
export const formatCredits = (n: number) => oneDecimal.format(n);
export const formatPercent = (ratio: number) => `${integer.format(ratio * 100)}%`;

/** 4,512 seconds reads as 1 h 15 m; under an hour as 12 m 05 s. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} m`;
  if (m > 0) return `${m} m ${String(rest).padStart(2, "0")} s`;
  return `${rest} s`;
}

/** Wall-clock time in UTC, so every visitor sees the same log. */
export function formatClock(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export const platformLabel: Record<Platform, string> = {
  web: "Browser",
  android: "Android emulator",
  ios: "iOS simulator",
};

export const verdictLabel: Record<ParityVerdict, string> = {
  identical: "Identical",
  diverged: "Diverged",
  "failed-original": "Failed on original",
  "failed-candidate": "Failed on regrowth",
};

export const agentLabel: Record<"claude-code" | "codex" | "gemini", string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
};
