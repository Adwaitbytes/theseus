import { z } from "zod";

/**
 * Theseus data contract. Every package, the CLI and the website read and write
 * these shapes, and everything committed under `runs/` must parse against them.
 */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected kebab-case");

/** A value Kane stores during a behavior, compared across implementations for parity. */
export const StoredKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected snake_case");

/**
 * One observable behavior of the app, written as a platform-neutral plain-English
 * objective so the same text can drive a browser, an Android emulator or an iOS simulator.
 */
export const Behavior = z.object({
  id: slug,
  title: z.string().min(3),
  area: z.string().min(2),
  objective: z.string().min(20),
  stores: z.array(StoredKey).default([]),
  tags: z.array(z.string()).default([]),
  source: z.enum(["capture", "docs", "manual"]),
});
export type Behavior = z.infer<typeof Behavior>;

export const Platform = z.enum(["web", "android", "ios"]);
export type Platform = z.infer<typeof Platform>;

export const Target = z.object({
  id: slug,
  label: z.string(),
  platform: Platform,
  stack: z.string(),
  url: z.string().url().optional(),
  app: z.string().optional(),
  original: z.boolean().default(false),
});
export type Target = z.infer<typeof Target>;

export const Spec = z.object({
  version: z.literal(1),
  app: z.object({
    name: z.string(),
    description: z.string(),
    origin: Target,
  }),
  capturedAt: z.string().datetime(),
  behaviors: z.array(Behavior).min(1),
});
export type Spec = z.infer<typeof Spec>;

export const KaneStatus = z.enum(["passed", "failed", "error", "timeout"]);
export type KaneStatus = z.infer<typeof KaneStatus>;

export const KaneBug = z.object({
  category: z.string(),
  severity: z.string(),
  oneLiner: z.string(),
  confidence: z.number().optional(),
});
export type KaneBug = z.infer<typeof KaneBug>;

/** The normalized outcome of a single Kane run, independent of which Kane surface produced it. */
export const KaneOutcome = z.object({
  status: KaneStatus,
  exitCode: z.number().int(),
  oneLiner: z.string(),
  reason: z.string(),
  durationS: z.number().nonnegative(),
  credits: z.number().nonnegative(),
  finalState: z.record(z.string(), z.string()),
  steps: z.array(
    z.object({ index: z.number().int(), status: z.enum(["done", "failed"]), remark: z.string() }),
  ),
  failingStep: z.object({ index: z.number().int(), remark: z.string() }).optional(),
  bug: KaneBug.optional(),
  testUrl: z.string().url().optional(),
  sessionDir: z.string().optional(),
  rca: z.object({ rootCause: z.string(), suggestedFix: z.string() }).optional(),
  /** Paths relative to the voyage directory, copied out of the sealed evidence pack. */
  artifacts: z
    .object({ finalShot: z.string().optional(), failShot: z.string().optional(), evidencePack: z.string().optional() })
    .default({}),
});
export type KaneOutcome = z.infer<typeof KaneOutcome>;

export const BehaviorResult = z.object({
  behaviorId: slug,
  targetId: slug,
  outcome: KaneOutcome,
});
export type BehaviorResult = z.infer<typeof BehaviorResult>;

export const AgentInfo = z.object({
  name: z.enum(["claude-code", "codex", "gemini"]),
  model: z.string(),
  version: z.string(),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

/** One build-then-verify iteration of a regrowth. */
export const Round = z.object({
  n: z.number().int().positive(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  commit: z.string().optional(),
  diffStat: z.object({ files: z.number().int(), additions: z.number().int(), deletions: z.number().int() }),
  results: z.array(BehaviorResult),
  feedback: z.string().optional(),
});
export type Round = z.infer<typeof Round>;

export const ParityValue = z.object({
  key: StoredKey,
  original: z.string().nullable(),
  candidate: z.string().nullable(),
  equal: z.boolean(),
});
export type ParityValue = z.infer<typeof ParityValue>;

export const ParityVerdict = z.enum(["identical", "diverged", "failed-original", "failed-candidate"]);
export type ParityVerdict = z.infer<typeof ParityVerdict>;

export const ParityRow = z.object({
  behaviorId: slug,
  original: KaneOutcome,
  candidate: KaneOutcome,
  values: z.array(ParityValue),
  verdict: ParityVerdict,
});
export type ParityRow = z.infer<typeof ParityRow>;

export const ParityReport = z.object({
  originalTargetId: slug,
  candidateTargetId: slug,
  rows: z.array(ParityRow),
  summary: z.object({
    identical: z.number().int(),
    diverged: z.number().int(),
    failed: z.number().int(),
    total: z.number().int(),
  }),
});
export type ParityReport = z.infer<typeof ParityReport>;

export const Regrowth = z.object({
  id: slug,
  target: Target,
  agent: AgentInfo,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  rounds: z.array(Round),
  parity: ParityReport.optional(),
  creditsUsed: z.number().nonnegative(),
});
export type Regrowth = z.infer<typeof Regrowth>;

export const Mutant = z.object({
  id: slug,
  description: z.string(),
  patch: z.string(),
  killedBy: z.array(slug),
});
export type Mutant = z.infer<typeof Mutant>;

/** How strong the captured spec is: the share of planted bugs at least one behavior catches. */
export const StrengthReport = z.object({
  mutants: z.array(Mutant),
  killed: z.number().int(),
  total: z.number().int(),
  score: z.number().min(0).max(1),
});
export type StrengthReport = z.infer<typeof StrengthReport>;

/** A full Theseus run on one app: the committed artifact behind every page of the website. */
export const Voyage = z.object({
  version: z.literal(1),
  id: slug,
  title: z.string(),
  spec: Spec,
  baseline: z.array(BehaviorResult),
  strength: StrengthReport.optional(),
  regrowths: z.array(Regrowth),
});
export type Voyage = z.infer<typeof Voyage>;

/** Live events emitted by the engine. The TUI renders them and `runs/<id>/events.ndjson` records them for replay. */
export const TheseusEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase"), at: z.string().datetime(), phase: z.enum(["capture", "baseline", "strength", "regrow", "parity", "done"]), detail: z.string().optional() }),
  z.object({ type: z.literal("kane-step"), at: z.string().datetime(), targetId: slug, behaviorId: slug, step: z.number().int(), status: z.enum(["running", "done", "failed"]), remark: z.string() }),
  z.object({ type: z.literal("behavior-start"), at: z.string().datetime(), targetId: slug, behaviorId: slug, round: z.number().int().nonnegative() }),
  z.object({ type: z.literal("behavior-result"), at: z.string().datetime(), targetId: slug, round: z.number().int().nonnegative(), result: BehaviorResult }),
  z.object({ type: z.literal("agent-output"), at: z.string().datetime(), targetId: slug, round: z.number().int().positive(), text: z.string() }),
  z.object({ type: z.literal("round-start"), at: z.string().datetime(), targetId: slug, round: z.number().int().positive() }),
  z.object({ type: z.literal("round-end"), at: z.string().datetime(), targetId: slug, round: z.number().int().positive(), passed: z.number().int(), total: z.number().int() }),
  z.object({ type: z.literal("log"), at: z.string().datetime(), level: z.enum(["info", "warn", "error"]), message: z.string() }),
]);
export type TheseusEvent = z.infer<typeof TheseusEvent>;
