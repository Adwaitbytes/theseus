import { TheseusError } from "../errors.js";

/**
 * Tracks Kane credits against an optional budget. Every phase asks before it
 * spends, using a per-run estimate, so a voyage stops cleanly instead of
 * running the account dry halfway through a round.
 */
export class CreditLedger {
  readonly budget: number | undefined;
  readonly perRunEstimate: number;
  #used: number;
  readonly #onChange: ((used: number) => void) | undefined;

  constructor(options: { budget?: number; used?: number; perRunEstimate: number; onChange?: (used: number) => void }) {
    this.budget = options.budget;
    this.perRunEstimate = options.perRunEstimate;
    this.#used = options.used ?? 0;
    this.#onChange = options.onChange;
  }

  get used(): number {
    return this.#used;
  }

  get remaining(): number {
    return this.budget === undefined ? Number.POSITIVE_INFINITY : Math.max(0, this.budget - this.#used);
  }

  estimate(runs: number): number {
    return runs * this.perRunEstimate;
  }

  /** Throws before a step whose estimated cost would exceed what is left. */
  ensure(runs: number, label: string): void {
    const needed = this.estimate(runs);
    if (needed > this.remaining) {
      throw new TheseusError(
        "budget-exceeded",
        `${label} needs about ${needed} credits (${runs} Kane runs x ${this.perRunEstimate}) but only ${Math.floor(this.remaining)} of the ${this.budget ?? 0} credit budget remain (${Math.round(this.#used)} used)`,
      );
    }
  }

  add(credits: number): void {
    this.#used += credits;
    this.#onChange?.(this.#used);
  }
}
