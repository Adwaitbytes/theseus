import { Behavior } from "@theseus/schema";
import { z } from "zod";
import { runJsonTask } from "../agents/json-task.js";
import type { BuilderAgent } from "../agents/types.js";

export const DraftOutput = z.object({ behaviors: z.array(Behavior).min(1) });
export type DraftOutput = z.infer<typeof DraftOutput>;

export const DRAFT_FILE = "behaviors.json";
const MIN_BEHAVIORS = 10;
const MAX_BEHAVIORS = 30;

const URL_PATTERN = /\bhttps?:\/\/|\blocalhost\b|\b127\.0\.0\.1\b/i;
const SELECTOR_PATTERN = /(?:^|\s)#[a-z][\w-]*|\[[a-z-]+=|\bdata-testid\b|\bxpath\b|\bcss\b|\bselector\b|\b(?:div|span|li|ul|input|button)\s+element\b/i;
const FRAMEWORK_PATTERN = /\b(?:jquery|react|angular|vue|svelte|sveltekit|next\.?js|expo|handlebars|backbone|localstorage|session storage|dom|browser|web ?page|url|address bar|page title)\b/i;
const STORE_PATTERN = /\bas '([a-z][a-z0-9_]*)'/g;
const VERIFY_PATTERN = /\b(?:verify|verifies|assert|confirm)\b/i;
const QUOTED_PATTERN = /"[^"]*"/g;
const SIGN_IN_PATTERN = /\b(?:sign(?:s|ed|ing)?|log(?:s|ged|ging)?)[ -]?in(?:to)?\b/i;
const SIGN_UP_PATTERN = /\b(?:sign(?:s|ed|ing)?[ -]?up|register(?:s|ed|ing)?|create[sd]? (?:an?|the|a new) account)\b/i;
const EMPTY_START_PATTERN = /\b(?:fresh app|no saved data|empty app)\b/i;

/** The seed every stateful run starts from, as the drafting agent sees it. */
export interface SeedContext {
  /** File name of the seed doc inside the drafting directory. */
  readonly file: string;
  /** Account emails the seed doc names; a sign-in must use one of them. */
  readonly emails: readonly string[];
}

export interface LintOptions {
  readonly seed?: SeedContext;
}

/**
 * Seeded-state rules: name the account whenever signing in, and never assume an empty app.
 * Quoted text is ignored, because "Sign in" as a visible link label is not a sign-in.
 */
function lintSeeded(where: string, objective: string, seed: SeedContext): string[] {
  const problems: string[] = [];
  const unquoted = objective.replace(QUOTED_PATTERN, '""');
  const lower = objective.toLowerCase();
  const namesSeedAccount = seed.emails.some((email) => lower.includes(email.toLowerCase()));
  if (SIGN_IN_PATTERN.test(unquoted) && !namesSeedAccount && !SIGN_UP_PATTERN.test(unquoted)) {
    problems.push(
      `${where}: the objective signs in without naming the account; use an email and password from ${seed.file} (one of ${seed.emails.join(", ")})`,
    );
  }
  if (EMPTY_START_PATTERN.test(unquoted)) {
    problems.push(`${where}: the app is never empty; start "from the seeded app" described in ${seed.file}`);
  }
  return problems;
}

/** Rules Theseus adds on top of the schema so one objective can drive a browser, an emulator and a simulator. */
export function lintBehaviors(behaviors: readonly Behavior[], options: LintOptions = {}): string[] {
  const problems: string[] = [];
  if (behaviors.length < MIN_BEHAVIORS || behaviors.length > MAX_BEHAVIORS) {
    problems.push(`write between ${MIN_BEHAVIORS} and ${MAX_BEHAVIORS} behaviors (aim for 15 to 25); you wrote ${behaviors.length}`);
  }
  const ids = new Set<string>();
  for (const behavior of behaviors) {
    const where = `behavior "${behavior.id}"`;
    if (ids.has(behavior.id)) problems.push(`${where}: duplicate id`);
    ids.add(behavior.id);
    const objective = behavior.objective;
    if (URL_PATTERN.test(objective)) problems.push(`${where}: the objective mentions a URL or host; describe screens, not addresses`);
    if (SELECTOR_PATTERN.test(objective)) problems.push(`${where}: the objective mentions a selector or markup; describe what a person sees`);
    const framework = FRAMEWORK_PATTERN.exec(objective);
    if (framework !== null) problems.push(`${where}: the objective mentions "${framework[0]}", which is not platform-neutral`);
    if (!VERIFY_PATTERN.test(objective)) problems.push(`${where}: the objective has no explicit verification (use "verify ...")`);
    const stored = new Set([...objective.matchAll(STORE_PATTERN)].map((match) => match[1] ?? ""));
    for (const key of behavior.stores) {
      if (!stored.has(key)) problems.push(`${where}: "stores" lists '${key}' but the objective never says "store ... as '${key}'"`);
    }
    for (const key of stored) {
      if (!behavior.stores.includes(key)) problems.push(`${where}: the objective stores '${key}' but "stores" does not list it`);
    }
    if (behavior.stores.length === 0) problems.push(`${where}: store at least one observable value so parity can compare it`);
    if (options.seed !== undefined) problems.push(...lintSeeded(where, objective, options.seed));
  }
  return problems;
}

const CLEAN_START_RULE = `- Start from a clean state: assume the app was just opened with no saved data, and say so ("Starting from a fresh app with no items, ...").`;

function seededStartRules(seed: SeedContext): string {
  const example = seed.emails[0] ?? "the account's email";
  return [
    `- Start from the seeded app: every run begins on a fresh copy of the seed data in ${seed.file}, signed out. Say so ("Starting from the seeded app, ..."). Never assume an empty app or "a fresh app with no saved data".`,
    `- Whenever a behavior signs in, name the exact account from ${seed.file} with its email and password in double quotes ("sign in with email "${example}" and password "<its password>""). Never write "sign in" or "log in" without the email.`,
    `- Only reference seeded content that ${seed.file} lists (exact usernames, titles, tags, comment text, counts). Anything else a behavior needs, it creates itself in that same behavior.`,
    "- A behavior may change data freely, since the next run starts from the seed again, but it must never depend on what another behavior changed.",
  ].join("\n");
}

function objectiveRules(seed: SeedContext | undefined): string {
  return `Rules for every objective (Kane CLI executes them on a browser, an Android emulator and an iOS simulator, so they must read the same everywhere):
- Plain English, platform-neutral. Never mention URLs, hosts, CSS selectors, element ids, markup, the DOM, local storage, the browser, or any framework or library. Describe what a person sees and does.
${seed === undefined ? CLEAN_START_RULE : seededStartRules(seed)}
- Lead each action with a verb and state goals, not click-by-click scripts. Keep literal data literal (exact item names in double quotes).
- One outcome per behavior, under about 15 steps. Chain clauses in order: action, then extraction, then assertion.
- End with explicit verifications of what is on screen ("verify the counter shows "2 items left""). The closing assertion is a look, not a trip: if the evidence is elsewhere, add the navigation as its own action first.
- Never assert the control that triggered an action; assert the outcome.
- For every value worth comparing across implementations, use the exact phrasing: store the <thing> as '<key>'. Keys are snake_case. List every key in "stores" and nothing else. Vague verbs like "read" or "note" do not store anything. Store exact visible text, never an interpretation: prefer a status or counter text exactly as shown and lists of visible item labels in display order separated by commas, and say what to store when the thing is absent (the word none). Reuse the same key names across behaviors for the same kind of value so parity reads consistently.
- Refer back to a stored value in plain English ("the stored item_count value"), never with braces.`;
}

const BEHAVIOR_SHAPE = `Each behavior is a JSON object:
{ "id": "kebab-case-id", "title": "Short title", "area": "feature area, e.g. Editing", "objective": "...", "stores": ["snake_case_key"], "tags": ["optional"], "source": "capture" | "docs" }
Use "source": "docs" when the behavior comes from the documentation rather than from what the crawl showed.`;

export interface DraftInput {
  readonly appName: string;
  readonly appDescription: string;
  /** File names inside the drafting directory. */
  readonly crawlSummaryFile: string;
  readonly docFiles: readonly string[];
  /** Set when the app keeps shared state: every run starts from this seed. */
  readonly seed?: SeedContext;
}

function seedIntro(seed: SeedContext | undefined): string[] {
  if (seed === undefined) return [];
  return [
    `Read ${seed.file} closely. It is the exact seed data every run starts from: the test accounts with their emails and passwords, and every piece of content that exists before anyone acts. The app is reset to this seed before each behavior runs.`,
    "",
  ];
}

export function buildDraftPrompt(input: DraftInput): string {
  return [
    `You are writing the behavioral specification of "${input.appName}": ${input.appDescription}`,
    "",
    `Read ${input.crawlSummaryFile} (a crawl of the running app with accessibility snapshots and screenshots)${input.docFiles.length > 0 ? ` and the documentation in ${input.docFiles.join(", ")}` : ""}. Look at the screenshots it references.`,
    "",
    ...seedIntro(input.seed),
    "Write 15 to 25 behaviors that together cover the whole app: every feature, the main edge cases (empty input, whitespace, many items), counters and summaries, filtering or navigation, editing, removal, and persistence after reopening the app. Each behavior must be something the original app really does.",
    "",
    objectiveRules(input.seed),
    "",
    BEHAVIOR_SHAPE,
    "",
    `Write the result to ${DRAFT_FILE} in the current directory as { "behaviors": [ ... ] }. Do not change any other file. Do not print the JSON; write the file.`,
  ].join("\n");
}

export interface RedraftItem {
  readonly behavior: Behavior;
  readonly failure: string;
  readonly suggestedFix?: string;
}

export function buildRedraftPrompt(items: readonly RedraftItem[], seed?: SeedContext): string {
  const blocks = items.map((item) =>
    [
      `## ${item.behavior.id}`,
      "```json",
      JSON.stringify(item.behavior, null, 2),
      "```",
      `Kane says the test itself is wrong, not the app: ${item.failure}`,
      ...(item.suggestedFix === undefined ? [] : [`Kane's suggested fix: ${item.suggestedFix}`]),
    ].join("\n"),
  );
  return [
    "These behaviors failed when Kane CLI ran them against the original app, and Kane's root cause analysis blames the test, not the app. Rewrite each objective so it describes what the original app really does, applying Kane's suggested fix. Keep each id, title, area and source; keep the stored keys unless the fix requires changing them.",
    "",
    ...seedIntro(seed),
    objectiveRules(seed),
    "",
    ...blocks,
    "",
    `Write the rewritten behaviors to ${DRAFT_FILE} in the current directory as { "behaviors": [ ... ] }, one entry per behavior above, in the same order.`,
  ].join("\n");
}

function lintOptions(seed: SeedContext | undefined): LintOptions {
  return seed === undefined ? {} : { seed };
}

export async function draftBehaviors(options: {
  agent: BuilderAgent;
  cwd: string;
  input: DraftInput;
  onOutput: (text: string) => void;
  signal?: AbortSignal;
}): Promise<Behavior[]> {
  const output = await runJsonTask({
    agent: options.agent,
    cwd: options.cwd,
    prompt: buildDraftPrompt(options.input),
    outputFile: DRAFT_FILE,
    schema: DraftOutput,
    lint: (value) => lintBehaviors(value.behaviors, lintOptions(options.input.seed)),
    onOutput: options.onOutput,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  return output.behaviors;
}

export async function redraftBehaviors(options: {
  agent: BuilderAgent;
  cwd: string;
  items: readonly RedraftItem[];
  seed?: SeedContext;
  onOutput: (text: string) => void;
  signal?: AbortSignal;
}): Promise<Behavior[]> {
  const expected = options.items.map((item) => item.behavior.id);
  const output = await runJsonTask({
    agent: options.agent,
    cwd: options.cwd,
    prompt: buildRedraftPrompt(options.items, options.seed),
    outputFile: DRAFT_FILE,
    schema: DraftOutput,
    lint: (value) => {
      const ids = value.behaviors.map((behavior) => behavior.id);
      const missing = expected.filter((id) => !ids.includes(id));
      const extra = ids.filter((id) => !expected.includes(id));
      const lint = lintBehaviors(value.behaviors, lintOptions(options.seed)).filter((problem) => !problem.startsWith("write between"));
      return [
        ...missing.map((id) => `behavior "${id}" is missing`),
        ...extra.map((id) => `behavior "${id}" was not asked for`),
        ...lint,
      ];
    },
    onOutput: options.onOutput,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  return output.behaviors;
}
