import type { BehaviorResult, TheseusEvent, Voyage } from "@theseus/schema";

/** What a matrix cell shows. Pending and running come from events, the verdicts from Kane. */
export type CellState = "pending" | "running" | "passed" | "failed";

export interface ReplayColumn {
  id: string;
  label: string;
  stack: string;
  platform: "web" | "android" | "ios";
  original: boolean;
  /** Column header on narrow screens. */
  short: string;
}

export interface ReplayRow {
  id: string;
  title: string;
}

/** One cell change, in recorded order. Compact so the whole replay ships cheaply to the client. */
export interface ReplayFrame {
  row: number;
  col: number;
  state: Exclude<CellState, "pending">;
  /** 0 is the baseline run on the original; regrowth rounds start at 1. */
  round: number;
  credits: number;
  /** Kane's remark for a failed result: the failing step, or the one-liner. */
  note?: string;
  at: string;
}

export interface ReplayData {
  voyageId: string;
  columns: ReplayColumn[];
  rows: ReplayRow[];
  frames: ReplayFrame[];
  /** "row:col" keys of cells that passed but whose stored values diverged from the original in the parity run. */
  diverged: string[];
}

export interface CellSnapshot {
  state: CellState;
  round: number;
  note?: string;
}

export interface ReplaySnapshot {
  /** cells[row][col] */
  cells: CellSnapshot[][];
  /** Latest round seen per column (0 for the original and for columns not started yet). */
  roundByColumn: number[];
  /** Behaviors passing on the original and on every regrowth. */
  proven: number;
  /** Regrowth rounds started so far across all targets. */
  rounds: number;
  /** Failed Kane results inside regrowth rounds: each one went back to the agent as feedback. */
  bugsCaught: number;
  credits: number;
  at: string | undefined;
}

function failureNote(result: BehaviorResult): string {
  const { outcome } = result;
  return outcome.failingStep?.remark ?? outcome.oneLiner;
}

/** "jQuery (2012)" reads as "jQuery", "Next.js" as "Next", "SvelteKit" as "Svelte". */
export function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)$/, "").replace(/\.js$/i, "").replace(/Kit$/, "");
}

function columnsOf(voyage: Voyage): ReplayColumn[] {
  const origin = voyage.spec.app.origin;
  return [
    { id: origin.id, label: origin.label, short: shortLabel(origin.label), stack: origin.stack, platform: origin.platform, original: true },
    ...voyage.regrowths.map((r) => ({
      id: r.target.id,
      label: r.target.label,
      short: shortLabel(r.target.label),
      stack: r.target.stack,
      platform: r.target.platform,
      original: false,
    })),
  ];
}

/**
 * Turns a voyage and its recorded events into replay frames. When no events were recorded,
 * frames are rebuilt from the voyage itself (baseline, then each regrowth's rounds in order).
 */
/**
 * Keeps only the attempt each certificate is built from. The event log is append-only, so it also holds
 * runs that were aborted or restarted (a crashed session, a fixed toolchain); replaying those would
 * inflate rounds and failures. Regrowths keep events from their last round 1 onward; the original keeps
 * only the latest baseline result per behavior.
 */
export function finalAttemptEvents(voyage: Voyage, events: readonly TheseusEvent[]): TheseusEvent[] {
  const originId = voyage.spec.app.origin.id;
  const attemptStart = new Map<string, number>();
  events.forEach((e, index) => {
    if (e.type === "round-start" && e.round === 1) attemptStart.set(e.targetId, index);
  });
  const lastBaseline = new Map<string, number>();
  events.forEach((e, index) => {
    if (e.type === "behavior-result" && e.result.targetId === originId && e.round === 0) lastBaseline.set(e.result.behaviorId, index);
  });
  return events.filter((e, index) => {
    if (e.type !== "behavior-start" && e.type !== "behavior-result") return true;
    const targetId = e.type === "behavior-start" ? e.targetId : e.result.targetId;
    const behaviorId = e.type === "behavior-start" ? e.behaviorId : e.result.behaviorId;
    if (targetId === originId && e.round === 0) {
      const last = lastBaseline.get(behaviorId);
      if (last === undefined) return false;
      if (e.type === "behavior-result") return index === last;
      // The start that belongs to the kept result is the latest start before it.
      const nextStart = events.findIndex((x, i) => i > index && x.type === "behavior-start" && x.targetId === originId && x.behaviorId === behaviorId && x.round === 0);
      return nextStart === -1 || nextStart > last;
    }
    return index >= (attemptStart.get(targetId) ?? 0);
  });
}

export function buildReplay(voyage: Voyage, allEvents: readonly TheseusEvent[]): ReplayData {
  const events = finalAttemptEvents(voyage, allEvents);
  const columns = columnsOf(voyage);
  const rows: ReplayRow[] = voyage.spec.behaviors.map((b) => ({ id: b.id, title: b.title }));
  const colIndex = new Map(columns.map((c, i) => [c.id, i]));
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  const frames: ReplayFrame[] = [];

  const push = (targetId: string, behaviorId: string, round: number, at: string, result?: BehaviorResult) => {
    const col = colIndex.get(targetId);
    const row = rowIndex.get(behaviorId);
    if (col === undefined || row === undefined) return;
    if (!result) {
      frames.push({ row, col, state: "running", round, credits: 0, at });
      return;
    }
    const passed = result.outcome.status === "passed";
    const frame: ReplayFrame = { row, col, state: passed ? "passed" : "failed", round, credits: result.outcome.credits, at };
    if (!passed) frame.note = failureNote(result);
    frames.push(frame);
  };

  const hasResults = events.some((e) => e.type === "behavior-result");
  if (hasResults) {
    for (const e of events) {
      if (e.type === "behavior-start") push(e.targetId, e.behaviorId, e.round, e.at);
      else if (e.type === "behavior-result") push(e.result.targetId, e.result.behaviorId, e.round, e.at, e.result);
    }
  } else {
    const originId = voyage.spec.app.origin.id;
    const capturedAt = voyage.spec.capturedAt;
    for (const r of voyage.baseline) {
      push(originId, r.behaviorId, 0, capturedAt);
      push(originId, r.behaviorId, 0, capturedAt, r);
    }
    for (const regrowth of voyage.regrowths) {
      for (const round of regrowth.rounds) {
        for (const r of round.results) {
          push(regrowth.target.id, r.behaviorId, round.n, round.startedAt);
          push(regrowth.target.id, r.behaviorId, round.n, round.endedAt, r);
        }
      }
    }
  }

  const diverged = voyage.regrowths.flatMap((r) =>
    (r.parity?.rows ?? [])
      .filter((row) => row.verdict === "diverged")
      .map((row) => `${rowIndex.get(row.behaviorId)}:${colIndex.get(r.target.id)}`),
  );

  return { voyageId: voyage.id, columns, rows, frames, diverged };
}

/** State of the matrix after applying the first `count` frames. */
export function snapshotAt(data: ReplayData, count: number): ReplaySnapshot {
  const cells: CellSnapshot[][] = data.rows.map(() => data.columns.map(() => ({ state: "pending" as CellState, round: 0 })));
  const roundByColumn = data.columns.map(() => 0);
  const seenRounds = new Set<string>();
  let bugsCaught = 0;
  let credits = 0;
  const limit = Math.max(0, Math.min(count, data.frames.length));

  for (let i = 0; i < limit; i++) {
    const f = data.frames[i]!;
    const cell = cells[f.row]![f.col]!;
    cell.state = f.state;
    cell.round = f.round;
    if (f.note === undefined) delete cell.note;
    else cell.note = f.note;
    if (f.round > (roundByColumn[f.col] ?? 0)) roundByColumn[f.col] = f.round;
    if (f.round > 0) seenRounds.add(`${f.col}:${f.round}`);
    if (f.state === "failed" && f.round > 0) bugsCaught++;
    credits += f.credits;
  }

  const proven = cells.filter((row) => row.every((c) => c.state === "passed")).length;
  return {
    cells,
    roundByColumn,
    proven,
    rounds: seenRounds.size,
    bugsCaught,
    credits: Math.round(credits * 10) / 10,
    at: limit > 0 ? data.frames[limit - 1]!.at : undefined,
  };
}

/** Frame indices where a column enters a new round, for scrubber tick marks. */
export function roundMarks(data: ReplayData): { index: number; col: number; round: number }[] {
  const marks: { index: number; col: number; round: number }[] = [];
  const last = new Map<number, number>();
  data.frames.forEach((f, index) => {
    if (f.round === 0 && f.col !== 0) return;
    if (last.get(f.col) !== f.round) {
      last.set(f.col, f.round);
      marks.push({ index, col: f.col, round: f.round });
    }
  });
  return marks;
}
