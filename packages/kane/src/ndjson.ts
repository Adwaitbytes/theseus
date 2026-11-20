import { z } from "zod";

/**
 * Parser for the `kane-cli run --agent` NDJSON stream (kane-cli skill, references/parsing.md).
 * The vocabulary is open: unknown fields and event types are ignored, non-JSON lines are skipped,
 * and progress lines are recognised by their `step` field because they carry no `type`.
 */

/** Optional field that degrades to `undefined` instead of rejecting the whole event when Kane changes its type. */
function lenient<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

export const ProgressLine = z.object({
  step: z.number().int(),
  status: z.string(),
  remark: z.string().catch(""),
  child_id: lenient(z.string()),
});
export type ProgressLine = z.infer<typeof ProgressLine>;

export const Verdict = z.looseObject({
  confirmed: lenient(z.boolean()),
  family: lenient(z.string()),
  category: lenient(z.string()),
  severity: lenient(z.string()),
  one_liner: lenient(z.string()),
  confidence: lenient(z.union([z.number(), z.string()])),
  root_cause: lenient(z.string()),
  suggestion: lenient(z.string()),
});
export type Verdict = z.infer<typeof Verdict>;

export const RunEnd = z.object({
  type: z.literal("run_end"),
  status: z.string().catch("unknown"),
  summary: lenient(z.string()),
  one_liner: lenient(z.string()),
  reason: lenient(z.string()),
  duration: lenient(z.number().nonnegative()),
  credits_consumed: lenient(z.number().nonnegative()),
  /** Name used by releases before `credits_consumed`. */
  credits: lenient(z.number().nonnegative()),
  final_state: lenient(z.record(z.string(), z.unknown())),
  session_dir: lenient(z.string()),
  test_url: lenient(z.string()),
  /** A number on 0.10.7 (100 success, 750 assertion failure, 740 confirmed bug); a string in the docs. */
  result_code: lenient(z.union([z.string(), z.number()]).transform(String)),
  reason_code: lenient(z.string()),
  verdict: lenient(Verdict),
});
export type RunEnd = z.infer<typeof RunEnd>;

export const ErrorEvent = z.object({
  type: z.literal("error"),
  message: z.string().catch(""),
  code: lenient(z.string()),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

export const WarningEvent = z.object({
  type: z.literal("warning"),
  code: lenient(z.string()),
  message: z.string().catch(""),
});
export type WarningEvent = z.infer<typeof WarningEvent>;

export const StreamStart = z.object({
  type: z.literal("stream_start"),
  cli_version: lenient(z.string()),
  surface: lenient(z.string()),
  pid: lenient(z.number()),
  session_dir: lenient(z.string()),
});
export type StreamStart = z.infer<typeof StreamStart>;

/** One per sealed pack, just before `run_end`; `pack` is the pack's absolute path. */
export const CoverageEvent = z.object({
  type: z.literal("coverage"),
  status: z.string().catch(""),
  pack: lenient(z.string()),
});
export type CoverageEvent = z.infer<typeof CoverageEvent>;

export type KaneEvent =
  | { readonly kind: "progress"; readonly event: ProgressLine }
  | { readonly kind: "run_end"; readonly event: RunEnd }
  | { readonly kind: "error"; readonly event: ErrorEvent }
  | { readonly kind: "warning"; readonly event: WarningEvent }
  | { readonly kind: "stream_start"; readonly event: StreamStart }
  | { readonly kind: "coverage"; readonly event: CoverageEvent };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // Kane may interleave plain text (banners, notices); the contract says to skip non-JSON lines.
    return undefined;
  }
}

/** Classifies one stdout line. Returns `null` for anything that is not a known, well-formed event. */
export function parseKaneLine(line: string): KaneEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  const value = parseJson(trimmed);
  if (!isRecord(value)) return null;

  if (typeof value.type === "string") {
    switch (value.type) {
      case "run_end": {
        const parsed = RunEnd.safeParse(value);
        return parsed.success ? { kind: "run_end", event: parsed.data } : null;
      }
      case "error": {
        const parsed = ErrorEvent.safeParse(value);
        return parsed.success ? { kind: "error", event: parsed.data } : null;
      }
      case "warning": {
        const parsed = WarningEvent.safeParse(value);
        return parsed.success ? { kind: "warning", event: parsed.data } : null;
      }
      case "stream_start": {
        const parsed = StreamStart.safeParse(value);
        return parsed.success ? { kind: "stream_start", event: parsed.data } : null;
      }
      case "coverage": {
        const parsed = CoverageEvent.safeParse(value);
        return parsed.success ? { kind: "coverage", event: parsed.data } : null;
      }
      default:
        return null;
    }
  }

  if ("step" in value) {
    const parsed = ProgressLine.safeParse(value);
    return parsed.success ? { kind: "progress", event: parsed.data } : null;
  }
  return null;
}

/** Reassembles complete lines from arbitrarily split stdout chunks. */
export class LineSplitter {
  #buffer = "";

  push(chunk: string): string[] {
    this.#buffer += chunk;
    const parts = this.#buffer.split(/\r?\n/);
    this.#buffer = parts.pop() ?? "";
    return parts.filter((part) => part.length > 0);
  }

  /** Returns the trailing line when the stream ended without a newline. */
  flush(): string[] {
    const rest = this.#buffer;
    this.#buffer = "";
    return rest.length > 0 ? [rest] : [];
  }
}

/** Parses a whole captured stream, such as a recorded fixture or `<session_dir>/events.ndjson`. */
export function parseKaneStream(text: string): KaneEvent[] {
  const splitter = new LineSplitter();
  const lines = [...splitter.push(text), ...splitter.flush()];
  return lines.map(parseKaneLine).filter((event): event is KaneEvent => event !== null);
}
