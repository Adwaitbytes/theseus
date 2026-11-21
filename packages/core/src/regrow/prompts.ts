import type { Behavior, BehaviorResult, Spec } from "@theseus/schema";
import type { TargetConfig } from "../config.js";
import { isInfrastructure, isPassed, rcaCategory, rcaRootCause } from "../kane/outcome.js";

function stackBrief(target: TargetConfig): string {
  const common = `Build it with ${target.stack}.`;
  const platform =
    target.platform === "web"
      ? [
          "It is a web app. From a clean checkout, `npm install && npm run build && npm run start` must work, and the server must listen on the port in the PORT environment variable (default 3000).",
          "Use npm (commit package-lock.json). Do not depend on any external service or API key.",
        ]
      : [
          `It is a native Expo app (React Native) that runs on ${target.platform === "android" ? "the Android emulator" : "the iOS simulator"}.`,
          "Keep a standard Expo project layout (app.json, package.json at the root) so it can be prebuilt and compiled locally. Use only Expo SDK modules that work offline.",
          "Make every control reachable by its visible label (set accessibilityLabel to the visible text where needed), because the behaviors are driven by what is on screen.",
          "It ships as a standalone release build: no Metro, no Expo Go, no dev client, no Expo Updates, and no network calls of any kind (no fetch, analytics, remote fonts or images).",
          "Persist all app data with @react-native-async-storage/async-storage so it survives closing and reopening the app. On a phone, reloading or reopening the app means relaunching it, and the screen must look exactly as it did before.",
          "Where the web original used URL routes for views or filters, keep that view state in the app and persist it the same way, so reopening the app returns to the same view.",
        ];
  return [common, ...platform, ...(target.brief === undefined ? [] : [target.brief])].join("\n");
}

/** SPEC.md is the only description of the app the builder ever sees: behaviors grouped by area, plus the stack brief. */
export function renderSpecMarkdown(spec: Spec, target: TargetConfig, referenceFiles: readonly string[]): string {
  const areas = new Map<string, Behavior[]>();
  for (const behavior of spec.behaviors) {
    const list = areas.get(behavior.area) ?? [];
    list.push(behavior);
    areas.set(behavior.area, list);
  }
  const sections = [...areas.entries()].map(([area, behaviors]) =>
    [
      `## ${area}`,
      "",
      ...behaviors.map((behavior) =>
        [
          `### ${behavior.title}`,
          "",
          `\`${behavior.id}\`${behavior.stores.length > 0 ? `, stores ${behavior.stores.map((key) => `\`${key}\``).join(", ")}` : ""}`,
          "",
          `> ${behavior.objective}`,
          "",
        ].join("\n"),
      ),
    ].join("\n"),
  );
  return [
    `# ${spec.app.name}`,
    "",
    spec.app.description,
    "",
    "## How this app is judged",
    "",
    "Every behavior below is executed literally by an AI testing agent (Kane CLI) that drives the app the way a person would: it reads the screen, types, taps and clicks. The app is correct when every behavior passes. Match visible text exactly where a behavior quotes it, because the agent compares what it sees with those words.",
    "",
    "## Target stack",
    "",
    stackBrief(target),
    "",
    ...(referenceFiles.length > 0
      ? ["## Reference screenshots", "", "Screens of the app this spec was captured from, in `reference/`. Match their layout and wording:", "", ...referenceFiles.map((file) => `- reference/${file}`), ""]
      : []),
    `## Behaviors (${spec.behaviors.length})`,
    "",
    ...sections,
  ].join("\n");
}

export function buildInitialPrompt(target: TargetConfig): string {
  return [
    `Build the app described in SPEC.md in this directory, from scratch, with ${target.stack}.`,
    "Read SPEC.md fully first and look at the screenshots in reference/. Implement every behavior. Make sure the project builds before you finish.",
    target.platform === "web"
      ? "Verify that `npm install && npm run build` succeeds. Do not start a long-running server."
      : "Verify that `npx expo export` or an equivalent offline check succeeds. Do not start the emulator or simulator.",
    "Do not edit SPEC.md or reference/. Work only inside this directory.",
  ].join("\n");
}

const MAX_FIELD = 600;

function clip(text: string): string {
  const single = text.trim();
  return single.length > MAX_FIELD ? `${single.slice(0, MAX_FIELD - 3)}...` : single;
}

export interface FeedbackItem {
  readonly behavior: Behavior;
  readonly result: BehaviorResult;
  /** Screenshot of the failing step, relative to the workspace. */
  readonly failShot?: string;
}

/** One compact block per failed behavior: what was asked, where it broke, and what Kane thinks went wrong. */
export function renderFeedbackItem(item: FeedbackItem): string {
  const outcome = item.result.outcome;
  const lines = [`### ${item.behavior.title} (\`${item.behavior.id}\`)`, "", `Objective: ${item.behavior.objective}`];
  if (outcome.failingStep !== undefined) {
    lines.push(`Failed at step ${outcome.failingStep.index}: ${clip(outcome.failingStep.remark)}`);
  }
  lines.push(`Kane: ${clip(outcome.reason || outcome.oneLiner)}`);
  const category = rcaCategory(outcome);
  const rootCause = rcaRootCause(outcome);
  if (rootCause !== undefined && rootCause !== "") {
    lines.push(`Root cause${category === undefined ? "" : ` (${category})`}: ${clip(rootCause)}`);
  } else if (category !== undefined) {
    lines.push(`Category: ${category}`);
  }
  if (outcome.rca !== undefined && outcome.rca.suggestedFix.trim() !== "") lines.push(`Suggested fix: ${clip(outcome.rca.suggestedFix)}`);
  if (item.failShot !== undefined) lines.push(`Screenshot of the failure: ${item.failShot}`);
  return lines.join("\n");
}

export function buildFeedbackPrompt(options: {
  round: number;
  passed: number;
  total: number;
  failures: readonly FeedbackItem[];
  buildError?: string;
}): string {
  const header = [
    `Round ${options.round}. Kane CLI ran the behaviors from SPEC.md against your app: ${options.passed} of ${options.total} pass.`,
    "",
  ];
  if (options.buildError !== undefined) {
    return [
      ...header,
      "The app did not build or start, so no behavior could run. Fix this first:",
      "",
      "```",
      options.buildError.trim(),
      "```",
      "",
      "Keep `npm install && npm run build && npm run start` working with the PORT environment variable. Do not edit SPEC.md.",
    ].join("\n");
  }
  return [
    ...header,
    "Fix the app so these behaviors pass, without breaking the ones that already pass. When Kane's root cause is an automation_bug the app may be right and the test flaky; check the screenshot before changing working code.",
    "",
    ...options.failures.map(renderFeedbackItem).flatMap((block) => [block, ""]),
    "Do not edit SPEC.md or reference/. Make sure the project still builds before you finish.",
  ].join("\n");
}

/** Failures worth showing the builder: real failures only, since infrastructure errors say nothing about the app. */
export function feedbackWorthy(results: readonly BehaviorResult[]): BehaviorResult[] {
  return results.filter((result) => !isPassed(result.outcome) && !isInfrastructure(result.outcome));
}
