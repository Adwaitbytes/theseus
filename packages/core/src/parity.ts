import type { BehaviorResult, ParityReport, ParityRow, ParityValue, ParityVerdict, Spec } from "@theseus/schema";
import { notRunOutcome } from "./kane/outcome.js";

/** Canonical text form: trimmed, inner whitespace collapsed, one layer of matching quotes removed. */
export function normalizeValue(value: string): string {
  let text = value.trim().replace(/\s+/g, " ");
  const quoted = /^(["'`])(.*)\1$/s.exec(text);
  if (quoted?.[2] !== undefined) text = quoted[2].trim();
  // Kane chooses its own spacing when it joins a list ("A,B" or "A, B"); the app's content is the same.
  // Numbers keep their thousands separators untouched.
  return /^[-+]?[\d.,\s]+$/.test(text) ? text : text.replace(/\s*,\s*/g, ", ");
}

function asBoolean(text: string): boolean | undefined {
  const lower = text.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return undefined;
}

function asNumber(text: string): number | undefined {
  // Grouping commas are presentation, not value: "1,000" on one stack is "1000" on another.
  const stripped = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(stripped)) return undefined;
  const number = Number(stripped);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Two stored values match when their normalized text is equal, when both are
 * booleans with the same truth value in any case, or when both are the same number.
 */
export function valuesEqual(original: string | null, candidate: string | null): boolean {
  if (original === null || candidate === null) return original === candidate;
  const a = normalizeValue(original);
  const b = normalizeValue(candidate);
  if (a === b) return true;
  const boolA = asBoolean(a);
  const boolB = asBoolean(b);
  if (boolA !== undefined && boolB !== undefined) return boolA === boolB;
  const numA = asNumber(a);
  const numB = asNumber(b);
  return numA !== undefined && numB !== undefined && numA === numB;
}

export function compareValues(keys: readonly string[], original: Record<string, string>, candidate: Record<string, string>): ParityValue[] {
  return keys.map((key) => {
    const a = original[key] ?? null;
    const b = candidate[key] ?? null;
    return { key, original: a, candidate: b, equal: valuesEqual(a, b) };
  });
}

/**
 * Compares what Kane stored on the original with what it stored on a regrown
 * target, behavior by behavior. Keys come from the behavior's declared `stores`,
 * so a target cannot pass parity by storing nothing.
 */
export function computeParity(
  spec: Spec,
  baseline: readonly BehaviorResult[],
  final: readonly BehaviorResult[],
  candidateTargetId: string,
): ParityReport {
  const originalById = new Map(baseline.map((result) => [result.behaviorId, result.outcome]));
  const candidateById = new Map(final.map((result) => [result.behaviorId, result.outcome]));
  const rows: ParityRow[] = spec.behaviors.map((behavior) => {
    const original = originalById.get(behavior.id) ?? notRunOutcome("not run on the original");
    const candidate = candidateById.get(behavior.id) ?? notRunOutcome("not run on the candidate");
    const values = compareValues(behavior.stores, original.finalState, candidate.finalState);
    let verdict: ParityVerdict;
    if (original.status !== "passed") verdict = "failed-original";
    else if (candidate.status !== "passed") verdict = "failed-candidate";
    else verdict = values.every((value) => value.equal) ? "identical" : "diverged";
    return { behaviorId: behavior.id, original, candidate, values, verdict };
  });
  const count = (verdicts: readonly ParityVerdict[]): number => rows.filter((row) => verdicts.includes(row.verdict)).length;
  return {
    originalTargetId: spec.app.origin.id,
    candidateTargetId,
    rows,
    summary: {
      identical: count(["identical"]),
      diverged: count(["diverged"]),
      failed: count(["failed-original", "failed-candidate"]),
      total: rows.length,
    },
  };
}
