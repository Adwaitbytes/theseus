import type { TheseusEvent } from "@theseus/schema";
import { throwIfAborted } from "../errors.js";

export interface ReplayTiming {
  /** Playback multiplier: 2 plays twice as fast as recorded. */
  readonly speed: number;
  /**
   * Upper bound on any single pause, in milliseconds at speed 1. Real voyages sit
   * idle for minutes while an agent builds; a replay keeps the rhythm, not the wait.
   */
  readonly maxGapMs: number;
}

export const defaultReplayTiming: ReplayTiming = { speed: 1, maxGapMs: 1200 };

/** Delay before each event, in milliseconds. The first event plays immediately. */
export function replayDelays(events: readonly TheseusEvent[], timing: ReplayTiming = defaultReplayTiming): number[] {
  if (!(timing.speed > 0)) throw new RangeError(`speed must be positive, got ${timing.speed}`);
  const delays: number[] = [];
  let previous: number | undefined;
  for (const event of events) {
    const at = Date.parse(event.at);
    const gap = previous === undefined ? 0 : Math.max(0, at - previous);
    delays.push(Math.round(Math.min(gap, timing.maxGapMs) / timing.speed));
    previous = at;
  }
  return delays;
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function replayEvents(
  events: readonly TheseusEvent[],
  onEvent: (event: TheseusEvent) => void,
  options: { timing?: ReplayTiming; sleep?: Sleep; signal?: AbortSignal } = {},
): Promise<void> {
  const sleep = options.sleep ?? realSleep;
  const delays = replayDelays(events, options.timing);
  for (const [index, event] of events.entries()) {
    throwIfAborted(options.signal);
    await sleep(delays[index] ?? 0, options.signal);
    onEvent(event);
  }
}
