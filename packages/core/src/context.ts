import { join } from "node:path";
import type { Target } from "@theseus/schema";
import type { AgentFactory } from "./agents/index.js";
import type { CrawlOptions, CrawlResult } from "./capture/crawl.js";
import type { ResolvedConfig } from "./config.js";
import type { EventBus } from "./events/bus.js";
import type { CreditLedger } from "./kane/budget.js";
import type { KaneRunContext } from "./kane/run.js";
import type { KaneClient, MobileBuilder } from "./ports.js";
import type { AppLauncher } from "./regrow/launcher.js";
import { stateResetter, type HttpFetch, type StateReset } from "./state.js";
import type { VoyagePaths } from "./voyage/store.js";

/** Everything with a side effect the engine depends on, injected so tests can replace each one. */
export interface EngineDeps {
  readonly kane: KaneClient;
  readonly bus: EventBus;
  readonly createAgent: AgentFactory;
  readonly mobile?: MobileBuilder;
  readonly crawl?: (options: CrawlOptions) => Promise<CrawlResult>;
  readonly launcher?: AppLauncher;
  /** HTTP used for state resets; defaults to the global fetch. */
  readonly fetch?: HttpFetch;
}

export interface PhaseContext {
  readonly config: ResolvedConfig;
  readonly deps: EngineDeps;
  readonly paths: VoyagePaths;
  readonly ledger: CreditLedger;
  readonly signal?: AbortSignal;
}

export function originTarget(config: ResolvedConfig): Target {
  return {
    id: config.original.id,
    label: config.original.label,
    platform: "web",
    stack: config.original.stack,
    url: config.original.url,
    original: true,
  };
}

/** The reset hook for this voyage, or undefined when the app keeps no shared state. */
export function stateResetterFor(ctx: PhaseContext): StateReset | undefined {
  const state = ctx.config.state;
  if (state === undefined) return undefined;
  return stateResetter(state, {
    ...(ctx.deps.fetch === undefined ? {} : { fetch: ctx.deps.fetch }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  });
}

export function kaneContext(ctx: PhaseContext, kaneDirName: string): KaneRunContext {
  const resetState = stateResetterFor(ctx);
  return {
    ...(resetState === undefined ? {} : { resetState }),
    kane: ctx.deps.kane,
    bus: ctx.deps.bus,
    ledger: ctx.ledger,
    voyageDir: ctx.paths.root,
    kaneCwd: join(ctx.config.workDir, ctx.config.id, ".kane", kaneDirName),
    timeoutS: ctx.config.kane.timeoutS,
    ...(ctx.config.kane.maxSteps === undefined ? {} : { maxSteps: ctx.config.kane.maxSteps }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  };
}
