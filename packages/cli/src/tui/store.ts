import type { TheseusEvent, Voyage } from "@theseus/schema";
import { initialState, reduce, type ViewSeed, type ViewState } from "./state.js";

export interface Snapshot {
  readonly view: ViewState;
  /** Set when the run is over: the voyage for the summary table, or the error that ended it. */
  readonly ending: { readonly voyage?: Voyage; readonly error?: string } | undefined;
}

/** External store for useSyncExternalStore: the engine pushes events, React pulls snapshots. */
export class ViewStore {
  #snapshot: Snapshot;
  readonly #listeners = new Set<() => void>();

  constructor(seed: ViewSeed) {
    this.#snapshot = { view: initialState(seed), ending: undefined };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): Snapshot => this.#snapshot;

  push(event: TheseusEvent): void {
    this.#snapshot = { ...this.#snapshot, view: reduce(this.#snapshot.view, event) };
    this.#notify();
  }

  finish(ending: { voyage?: Voyage; error?: string }): void {
    this.#snapshot = { ...this.#snapshot, ending };
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
