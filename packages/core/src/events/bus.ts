import { EventEmitter } from "node:events";
import type { TheseusEvent } from "@theseus/schema";

/** Event payload as callers build it; the bus stamps `at`. */
export type TheseusEventInput = TheseusEvent extends infer E
  ? E extends TheseusEvent
    ? Omit<E, "at"> & { at?: string }
    : never
  : never;

export type EventListener = (event: TheseusEvent) => void;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Typed fan-out of engine events. Listeners run synchronously in emit order, so the recorder sees events in the same order as the TUI. */
export class EventBus {
  readonly #emitter = new EventEmitter();
  readonly #clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.#clock = clock;
    // The TUI, the recorder and per-phase collectors can all subscribe at once.
    this.#emitter.setMaxListeners(50);
  }

  emit(input: TheseusEventInput): TheseusEvent {
    const event = { ...input, at: input.at ?? this.#clock.now().toISOString() } as TheseusEvent;
    this.#emitter.emit("event", event);
    return event;
  }

  on(listener: EventListener): () => void {
    this.#emitter.on("event", listener);
    return () => this.#emitter.off("event", listener);
  }

  log(level: "info" | "warn" | "error", message: string): void {
    this.emit({ type: "log", level, message });
  }
}
