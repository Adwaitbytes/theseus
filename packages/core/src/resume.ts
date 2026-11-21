import { readFile } from "node:fs/promises";
import { TheseusEvent, type BehaviorResult } from "@theseus/schema";

/**
 * Passing results already recorded in a voyage's event log for one target and round.
 * A run interrupted mid-phase (a closed terminal, a crash) has paid for these Kane runs,
 * so resuming reuses them instead of spending the credits again. Only passes are reused:
 * anything else deserves a fresh verdict.
 */
export async function recordedPasses(eventsFile: string, targetId: string, round: number): Promise<Map<string, BehaviorResult>> {
  let text: string;
  try {
    text = await readFile(eventsFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  const passes = new Map<string, BehaviorResult>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = TheseusEvent.safeParse(JSON.parse(line));
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.type !== "behavior-result" || event.targetId !== targetId || event.round !== round) continue;
    if (event.result.outcome.status === "passed") passes.set(event.result.behaviorId, event.result);
    else passes.delete(event.result.behaviorId);
  }
  return passes;
}
