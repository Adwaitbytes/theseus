import { isAbsolute } from "node:path";
import type { KaneOutcome } from "@theseus/schema";

/**
 * Everything under runs/ is committed and published, so persisted data must not
 * carry absolute paths (they embed the operator's username) or evidence packs
 * (they embed the account email).
 */
export function sanitizeOutcome(outcome: KaneOutcome): KaneOutcome {
  const { sessionDir: _sessionDir, artifacts, ...rest } = outcome;
  const kept: KaneOutcome["artifacts"] = {};
  if (artifacts.finalShot !== undefined && !isAbsolute(artifacts.finalShot)) kept.finalShot = artifacts.finalShot;
  if (artifacts.failShot !== undefined && !isAbsolute(artifacts.failShot)) kept.failShot = artifacts.failShot;
  return { ...rest, artifacts: kept };
}

const HOME_PATH = /(?:\/Users|\/home)\/[^/\s"'`]+|[A-Za-z]:\\Users\\[^\\\s"'`]+/g;

/** Replaces home-directory prefixes in free text (Kane remarks and agent output can quote paths). */
export function scrubHomePaths(text: string): string {
  return text.replace(HOME_PATH, "~");
}

function isOutcome(value: Record<string, unknown>): boolean {
  return "status" in value && "finalState" in value && "steps" in value && "artifacts" in value;
}

/** Deep-cleans any JSON value before it is written under runs/. */
export function sanitizeForPersistence<T>(value: T): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") return scrubHomePaths(node);
    if (Array.isArray(node)) return node.map(visit);
    if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      const source = isOutcome(record) ? (sanitizeOutcome(record as KaneOutcome) as Record<string, unknown>) : record;
      return Object.fromEntries(Object.entries(source).map(([key, child]) => [key, visit(child)]));
    }
    return node;
  };
  return visit(value) as T;
}
