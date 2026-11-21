import { join, resolve } from "node:path";
import {
  ORIGINAL_ALIAS,
  TheseusError,
  defaultLauncher,
  errorMessage,
  prepareLiveTarget,
  readVoyage,
  requireBehavior,
  resolveVerifyTarget,
  verifyCells,
  type CellComparison,
  type KaneClient,
  type MobileBuilder,
} from "@theseus/core";
import { createKaneClient } from "@theseus/kane";
import type { KaneOutcome, Voyage } from "@theseus/schema";
import { loadMobileBuilder } from "./deps.js";
import { plural, stdoutColorizer, type Colorize } from "./output.js";
import { pad, truncate } from "./tui/theme.js";

export interface VerifyOptions {
  readonly behavior?: string;
  readonly all?: boolean;
  readonly target: string;
  readonly url?: string;
  readonly app?: string;
  /** Root of the clean-room workspaces, as in the config's `workDir`. */
  readonly workDir: string;
  readonly timeout: number;
  readonly json?: boolean;
}

export interface VerifyDeps {
  readonly kane: KaneClient;
  readonly loadMobile: () => Promise<MobileBuilder | undefined>;
  readonly write: (text: string) => void;
  readonly color: Colorize;
  readonly now: () => Date;
}

export function defaultVerifyDeps(): VerifyDeps {
  return {
    kane: createKaneClient(),
    loadMobile: loadMobileBuilder,
    write: (text) => process.stdout.write(text),
    color: stdoutColorizer(),
    now: () => new Date(),
  };
}

const LABEL = 14;
const VALUE = 30;

function verdictText(outcome: KaneOutcome): string {
  return outcome.status === "passed" ? "passed" : `${outcome.status}: ${outcome.oneLiner}`;
}

function shown(value: string | null): string {
  return value === null ? "(not stored)" : JSON.stringify(value);
}

/** Recorded and fresh side by side: the verdict, then every declared stored value. */
export function renderCellDetail(cell: CellComparison, color: Colorize): string[] {
  const head = `${color(cell.behaviorId, undefined, true)}  ${cell.match ? color("holds", "pass") : color("breaks", "fail")}`;
  const row = (label: string, recorded: string, fresh: string, equal: boolean): string =>
    `  ${pad(label, LABEL)}${pad(truncate(recorded, VALUE - 1), VALUE)}${color(truncate(fresh, VALUE - 1), equal ? undefined : "fail")}`;
  return [
    head,
    color(`  ${pad("", LABEL)}${pad("recorded", VALUE)}now`, "muted"),
    row("verdict", verdictText(cell.recorded), verdictText(cell.fresh), cell.statusMatch),
    ...cell.values.map((value) => row(value.key, shown(value.original), shown(value.candidate), value.equal)),
  ];
}

/** One line per cell for `--all`, so a whole suite reads at a glance. */
export function renderCellLine(cell: CellComparison, color: Colorize): string {
  const equal = cell.values.filter((value) => value.equal).length;
  const values = cell.values.length === 0 ? "no values" : `${equal}/${cell.values.length} values`;
  const result = cell.match ? color("holds", "pass") : color("breaks", "fail");
  return `  ${pad(cell.behaviorId, 28)}${pad(cell.recorded.status, 10)}${pad(cell.fresh.status, 10)}${pad(values, 12)}${result}`;
}

export function renderTableHeader(color: Colorize): string {
  return color(`  ${pad("Behavior", 28)}${pad("Recorded", 10)}${pad("Now", 10)}${pad("Stored", 12)}Result`, "muted");
}

/**
 * What follows the run: every cell side by side for a single behavior; for `--all`, whose table
 * streamed live, only the cells that broke.
 */
export function renderVerifyFooter(cells: readonly CellComparison[], all: boolean, color: Colorize): string {
  const broken = cells.filter((cell) => !cell.match);
  const lines: string[] = [];
  for (const cell of all ? broken : cells) {
    if (lines.length > 0 || all) lines.push("");
    lines.push(...renderCellDetail(cell, color));
  }
  const held = cells.length - broken.length;
  const summary =
    broken.length === 0
      ? color(`${held} of ${plural(cells.length, "cell")} hold. The certificate stands.`, "pass")
      : color(`${broken.length} of ${plural(cells.length, "cell")} no longer match the certificate.`, "fail");
  return `${[...lines, "", summary].join("\n")}\n`;
}

function selectBehaviors(voyage: Voyage, options: VerifyOptions) {
  if (options.all === true && options.behavior !== undefined) {
    throw new TheseusError("config-invalid", "pass --behavior <id> or --all, not both");
  }
  if (options.all === true) return voyage.spec.behaviors;
  if (options.behavior === undefined) throw new TheseusError("config-invalid", "pass --behavior <id> to verify one cell, or --all for the whole suite");
  return [requireBehavior(voyage, options.behavior)];
}

export async function loadRun(runDir: string): Promise<Voyage> {
  const voyage = await readVoyage(join(resolve(runDir), "voyage.json"));
  if (voyage === undefined) throw new TheseusError("file-invalid", `no voyage.json in ${runDir}; pass a run directory such as runs/<voyage-id>`);
  return voyage;
}

/** `theseus verify`: re-proves certificate cells live with Kane. Exits 1 when any cell no longer matches. */
export async function verify(runDir: string, options: VerifyOptions, deps: VerifyDeps = defaultVerifyDeps(), signal?: AbortSignal): Promise<number> {
  const voyage = await loadRun(runDir);
  const behaviors = selectBehaviors(voyage, options);
  const resolved = resolveVerifyTarget(voyage, options.target);
  const recordedId = resolved.isOriginal ? ORIGINAL_ALIAS : resolved.target.id;
  const { color, write } = deps;
  const quiet = options.json === true;
  const all = options.all === true;
  if (!quiet) {
    write(`Verifying ${plural(behaviors.length, "behavior")} on ${color(resolved.target.label, "brand")} with Kane\n\n`);
    if (all) write(`${renderTableHeader(color)}\n`);
  }
  const mobile = resolved.target.platform === "web" ? undefined : await deps.loadMobile();
  const workDir = resolve(options.workDir);
  const live = await prepareLiveTarget(resolved, {
    workspace: join(workDir, voyage.id, resolved.target.id),
    launcher: defaultLauncher,
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.app === undefined ? {} : { app: options.app }),
    ...(mobile === undefined ? {} : { mobile }),
    ...(signal === undefined ? {} : { signal }),
  });
  let cells: CellComparison[];
  try {
    const stamp = deps.now().toISOString().replace(/[:.]/g, "-");
    cells = await verifyCells(voyage, behaviors, live, recordedId, {
      kane: deps.kane,
      workDir: join(workDir, voyage.id, "verify", resolved.target.id, stamp),
      timeoutS: options.timeout,
      ...(signal === undefined ? {} : { signal }),
      ...(quiet || !all ? {} : { onResult: (cell: CellComparison) => write(`${renderCellLine(cell, color)}\n`) }),
    });
  } finally {
    await live.stop().catch((error: unknown) => {
      if (!quiet) write(color(`could not stop ${resolved.target.id}: ${errorMessage(error)}\n`, "running"));
    });
  }
  if (quiet) write(`${JSON.stringify({ voyage: voyage.id, target: recordedId, cells }, null, 2)}\n`);
  else write(renderVerifyFooter(cells, all, color));
  return cells.every((cell) => cell.match) ? 0 : 1;
}
