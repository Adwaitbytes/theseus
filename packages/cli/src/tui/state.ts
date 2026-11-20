import type { BehaviorResult, TheseusEvent, Voyage } from "@theseus/schema";

export type CellState = "pending" | "running" | "pass" | "fail" | "error";

export interface Lane {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
  readonly isOriginal: boolean;
  round: number;
  /** What the lane is doing right now, for its status word. */
  activity: "waiting" | "building" | "verifying" | "done";
  cells: Map<string, CellState>;
  passed: number;
  total: number;
  credits: number;
  remark: string | undefined;
  agentTail: string[];
}

export interface ViewState {
  title: string;
  phase: string;
  phaseDetail: string | undefined;
  maxRounds: number | undefined;
  behaviors: string[];
  lanes: Lane[];
  logs: { level: "info" | "warn" | "error"; message: string }[];
  credits: number;
  startedAt: number | undefined;
  lastAt: number | undefined;
  done: boolean;
}

export interface LaneSeed {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
  readonly isOriginal: boolean;
}

export interface ViewSeed {
  readonly title: string;
  readonly maxRounds?: number;
  readonly behaviors?: readonly string[];
  readonly lanes?: readonly LaneSeed[];
}

const AGENT_TAIL = 3;
const LOG_TAIL = 3;

function newLane(seed: LaneSeed, behaviors: readonly string[]): Lane {
  return {
    ...seed,
    round: 0,
    activity: "waiting",
    cells: new Map(behaviors.map((id) => [id, "pending" as const])),
    passed: 0,
    total: behaviors.length,
    credits: 0,
    remark: undefined,
    agentTail: [],
  };
}

export function initialState(seed: ViewSeed): ViewState {
  const behaviors = [...(seed.behaviors ?? [])];
  return {
    title: seed.title,
    phase: "starting",
    phaseDetail: undefined,
    maxRounds: seed.maxRounds,
    behaviors,
    lanes: (seed.lanes ?? []).map((lane) => newLane(lane, behaviors)),
    logs: [],
    credits: 0,
    startedAt: undefined,
    lastAt: undefined,
    done: false,
  };
}

/** Seeds lanes and the behavior grid from a voyage, so the grid has its final shape from the first frame. */
export function seedFromVoyage(voyage: Voyage, maxRounds?: number): ViewSeed {
  const origin = voyage.spec.app.origin;
  return {
    title: voyage.title,
    ...(maxRounds === undefined ? {} : { maxRounds }),
    behaviors: voyage.spec.behaviors.map((behavior) => behavior.id),
    lanes: [
      { id: origin.id, label: origin.label, stack: origin.stack, isOriginal: true },
      ...voyage.regrowths.map((regrowth) => ({
        id: regrowth.target.id,
        label: regrowth.target.label,
        stack: regrowth.target.stack,
        isOriginal: false,
      })),
    ],
  };
}

function laneFor(state: ViewState, id: string): Lane {
  let lane = state.lanes.find((candidate) => candidate.id === id);
  if (lane === undefined) {
    lane = newLane({ id, label: id, stack: "", isOriginal: false }, state.behaviors);
    state.lanes.push(lane);
  }
  return lane;
}

function ensureBehavior(state: ViewState, behaviorId: string): void {
  if (state.behaviors.includes(behaviorId)) return;
  state.behaviors.push(behaviorId);
  for (const lane of state.lanes) {
    if (!lane.cells.has(behaviorId)) lane.cells.set(behaviorId, "pending");
    lane.total = state.behaviors.length;
  }
}

function cellFor(result: BehaviorResult): CellState {
  switch (result.outcome.status) {
    case "passed":
      return "pass";
    case "failed":
    case "timeout":
      return "fail";
    case "error":
      return "error";
  }
}

function countPassed(lane: Lane): number {
  let passed = 0;
  for (const cell of lane.cells.values()) if (cell === "pass") passed += 1;
  return passed;
}

/**
 * Folds one engine event into the view. Mutates and returns a fresh top-level
 * object so React sees a change while the per-event cost stays constant.
 */
export function reduce(state: ViewState, event: TheseusEvent): ViewState {
  const at = Date.parse(event.at);
  state.startedAt ??= at;
  state.lastAt = Math.max(state.lastAt ?? at, at);
  switch (event.type) {
    case "phase":
      state.phase = event.phase;
      state.phaseDetail = event.detail;
      if (event.phase === "done") {
        state.done = true;
        for (const lane of state.lanes) lane.activity = "done";
      } else if (event.phase !== "capture" && event.phase !== "baseline") {
        // The original's lane only works during capture and baseline; afterwards it is the finished reference.
        for (const lane of state.lanes) if (lane.isOriginal) lane.activity = "done";
      }
      break;
    case "round-start": {
      const lane = laneFor(state, event.targetId);
      lane.round = event.round;
      lane.activity = "building";
      lane.agentTail = [];
      break;
    }
    case "round-end": {
      const lane = laneFor(state, event.targetId);
      lane.passed = event.passed;
      lane.total = event.total;
      lane.activity = "waiting";
      break;
    }
    case "behavior-start": {
      ensureBehavior(state, event.behaviorId);
      const lane = laneFor(state, event.targetId);
      lane.activity = "verifying";
      lane.cells.set(event.behaviorId, "running");
      break;
    }
    case "kane-step": {
      const lane = laneFor(state, event.targetId);
      lane.remark = `${event.behaviorId}  ${event.step}  ${event.remark}`;
      break;
    }
    case "behavior-result": {
      ensureBehavior(state, event.result.behaviorId);
      const lane = laneFor(state, event.targetId);
      lane.cells.set(event.result.behaviorId, cellFor(event.result));
      lane.passed = countPassed(lane);
      lane.credits += event.result.outcome.credits;
      state.credits += event.result.outcome.credits;
      break;
    }
    case "agent-output": {
      const lane = laneFor(state, event.targetId);
      lane.agentTail = [...lane.agentTail, event.text].slice(-AGENT_TAIL);
      if (lane.activity !== "verifying") lane.activity = "building";
      break;
    }
    case "log":
      state.logs = [...state.logs, { level: event.level, message: event.message }].slice(-LOG_TAIL);
      break;
  }
  return { ...state };
}

export interface SummaryRow {
  readonly id: string;
  readonly label: string;
  readonly rounds: string;
  readonly proven: string;
  readonly parity: string;
  readonly credits: string;
  readonly verdict: "identical" | "partial" | "failed" | "original";
}

/** The closing table: one row per target, parity from the voyage when it has been computed. */
export function summaryRows(state: ViewState, voyage: Voyage | undefined): SummaryRow[] {
  return state.lanes.map((lane) => {
    const regrowth = voyage?.regrowths.find((candidate) => candidate.id === lane.id);
    const parity = regrowth?.parity?.summary;
    const proven = `${lane.passed}/${lane.total}`;
    if (lane.isOriginal) {
      return { id: lane.id, label: lane.label, rounds: "baseline", proven, parity: "reference", credits: String(Math.round(lane.credits)), verdict: "original" };
    }
    const rounds = regrowth?.rounds.length ?? lane.round;
    let verdict: SummaryRow["verdict"] = "failed";
    if (parity !== undefined && parity.total > 0) {
      verdict = parity.identical === parity.total ? "identical" : parity.identical > 0 ? "partial" : "failed";
    } else if (lane.total > 0) {
      verdict = lane.passed === lane.total ? "identical" : lane.passed > 0 ? "partial" : "failed";
    }
    return {
      id: lane.id,
      label: lane.label,
      rounds: String(rounds),
      proven,
      parity: parity === undefined ? "pending" : `${parity.identical}/${parity.total} identical`,
      credits: String(Math.round(regrowth?.creditsUsed ?? lane.credits)),
      verdict,
    };
  });
}
