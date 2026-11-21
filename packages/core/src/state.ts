import { readFile } from "node:fs/promises";
import type { Target } from "@theseus/schema";
import type { StateConfig } from "./config.js";
import { TheseusError, errorMessage, throwIfAborted } from "./errors.js";

/** The slice of `fetch` a reset needs, so tests can answer without a server. */
export type HttpFetch = (
  url: string,
  init: { readonly method: string; readonly signal: AbortSignal },
) => Promise<{ readonly status: number; text(): Promise<string> }>;

/** Puts a web target back to its seed before a Kane run. */
export type StateReset = (target: Target) => Promise<void>;

export interface ResetOptions {
  readonly fetch?: HttpFetch;
  readonly signal?: AbortSignal;
  /** Per attempt. The contract asks for under 2 seconds; this leaves room for a cold process. */
  readonly timeoutMs?: number;
  readonly retryDelayMs?: number;
}

const ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAY_MS = 300;
const BODY_PREVIEW = 200;

/** The reset path is resolved against the target's origin, so "/__theseus/reset" works for any base URL. */
export function resetUrlFor(baseUrl: string, resetPath: string): string {
  return new URL(resetPath, baseUrl).toString();
}

const defaultFetch: HttpFetch = (url, init) => fetch(url, init);

/** Calls the reset endpoint and requires a 2xx, retrying once before giving up. */
export async function resetState(baseUrl: string, state: Pick<StateConfig, "resetUrl" | "method">, options: ResetOptions = {}): Promise<void> {
  const url = resetUrlFor(baseUrl, state.resetUrl);
  const doFetch = options.fetch ?? defaultFetch;
  let lastError = "no response";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    throwIfAborted(options.signal);
    const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]);
    try {
      const response = await doFetch(url, { method: state.method, signal });
      if (response.status >= 200 && response.status < 300) return;
      const body = (await response.text()).trim().slice(0, BODY_PREVIEW);
      lastError = `HTTP ${response.status}${body === "" ? "" : `: ${body}`}`;
    } catch (error) {
      if (options.signal?.aborted === true) throw new TheseusError("aborted", "operation aborted", { cause: error });
      lastError = errorMessage(error);
    }
    if (attempt < ATTEMPTS) await new Promise((resolveWait) => setTimeout(resolveWait, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
  }
  throw new TheseusError(
    "state-reset-failed",
    `${state.method} ${url} did not restore the seed after ${ATTEMPTS} attempts (${lastError}). ` +
      `Make sure the app is running and that ${state.method} ${state.resetUrl} restores the seed and answers 2xx.`,
  );
}

/** A reset hook for Kane runs: web targets reset against their own URL, other platforms have nothing to reset. */
export function stateResetter(state: StateConfig, options: ResetOptions = {}): StateReset {
  return async (target) => {
    if (target.platform !== "web") return;
    if (target.url === undefined) {
      throw new TheseusError("phase-precondition", `cannot reset ${target.id}: the web target has no URL`);
    }
    await resetState(target.url, state, options);
  };
}

export interface SeedDoc {
  readonly text: string;
  /** Every email address the seed doc names; signing in must use one of these. */
  readonly emails: readonly string[];
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function parseSeedDoc(text: string): SeedDoc {
  const emails = [...new Set([...text.matchAll(EMAIL_PATTERN)].map((match) => match[0].toLowerCase()))];
  return { text, emails };
}

export async function readSeedDoc(path: string): Promise<SeedDoc> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new TheseusError("config-invalid", `cannot read state.seedDoc ${path}`, { cause: error });
  }
  const seed = parseSeedDoc(text);
  if (seed.emails.length === 0) {
    throw new TheseusError("config-invalid", `state.seedDoc ${path} names no account email; list every test account with its email and password`);
  }
  return seed;
}
