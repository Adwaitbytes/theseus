import type { TheseusEvent, Voyage } from "@theseus/schema";

/**
 * The events behind what a voyage certifies. The event log is append-only, so it also keeps
 * attempts that were aborted or restarted (a crashed session, a broken toolchain, a target that
 * never finished). Replaying those would show rounds and failures the certificate does not count.
 * This keeps, per regrown target, only its last attempt (from its last round 1 onward); for the
 * original, only the latest baseline result per behavior; and drops targets with no regrowth record.
 */
export function certifiedAttempt(voyage: Voyage, events: readonly TheseusEvent[]): TheseusEvent[] {
  const originId = voyage.spec.app.origin.id;
  const certified = new Set([originId, ...voyage.regrowths.map((regrowth) => regrowth.target.id)]);
  const everyTarget = new Set<string>();
  const attemptStart = new Map<string, number>();
  const lastBaseline = new Map<string, number>();
  events.forEach((event, index) => {
    if ("targetId" in event) everyTarget.add(event.targetId);
    if (event.type === "round-start" && event.round === 1) attemptStart.set(event.targetId, index);
    if (event.type === "behavior-result" && event.targetId === originId && event.round === 0) lastBaseline.set(event.result.behaviorId, index);
  });
  // Logs carry their target as a prefix ("nextjs round 2: …", "expo-ios: …").
  const logTarget = (message: string): string | undefined =>
    [...everyTarget].find((id) => message.startsWith(`${id} `) || message.startsWith(`${id}:`));

  return events.filter((event, index) => {
    const target = event.type === "log" ? logTarget(event.message) : "targetId" in event ? event.targetId : undefined;
    if (target === undefined) return true;
    if (!certified.has(target)) return false;
    if (target === originId) {
      return event.type !== "behavior-result" || event.round !== 0 || lastBaseline.get(event.result.behaviorId) === index;
    }
    return index >= (attemptStart.get(target) ?? 0);
  });
}
