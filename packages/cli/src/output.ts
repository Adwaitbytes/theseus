import { colorEnabled, type Tone } from "./tui/theme.js";

/**
 * Plain-text output for the non-TUI commands (verify, suite, doctor). Color is ANSI so it works
 * without Ink, and is dropped under NO_COLOR or when stdout is not a terminal.
 */
const ANSI: Record<Tone, string> = {
  brand: "36",
  pass: "32",
  fail: "31",
  running: "33",
  infra: "35",
  muted: "2",
};

export type Colorize = (text: string, tone: Tone | undefined, bold?: boolean) => string;

export function colorizer(enabled: boolean): Colorize {
  return (text, tone, bold = false) => {
    if (!enabled || (tone === undefined && !bold)) return text;
    const codes = [...(bold ? ["1"] : []), ...(tone === undefined ? [] : [ANSI[tone]])];
    return `\u001b[${codes.join(";")}m${text}\u001b[0m`;
  };
}

export function stdoutColorizer(): Colorize {
  return colorizer(colorEnabled() && process.stdout.isTTY);
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
