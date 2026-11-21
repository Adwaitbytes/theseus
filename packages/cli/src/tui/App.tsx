import { Box, Text, useAnimation, useWindowSize } from "ink";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Voyage } from "@theseus/schema";
import { raceTables, summaryRows, type Lane, type RaceRow, type SummaryRow, type ViewState } from "./state.js";
import type { ViewStore } from "./store.js";
import { CELL_GLYPH, CELL_TONE, SPINNER, formatElapsed, pad, paint, truncate, type Tone } from "./theme.js";

interface Ctx {
  readonly color: boolean;
  readonly width: number;
  readonly compact: boolean;
}

const MAX_WIDTH = 112;
const LABEL_WIDTH = 16;
const ROUND_WIDTH = 11;
const COUNT_WIDTH = 7;
const ACTIVITY_WIDTH = 12;

function T(props: { tone?: Tone | undefined; ctx: Ctx; bold?: boolean; children: ReactNode }): ReactNode {
  return (
    <Text {...paint(props.tone, props.ctx.color)} bold={props.bold ?? false} wrap="truncate-end">
      {props.children}
    </Text>
  );
}

function Rule({ ctx }: { ctx: Ctx }): ReactNode {
  return <T ctx={ctx} tone="muted">{"─".repeat(ctx.width)}</T>;
}

function Header({ view, ctx }: { view: ViewState; ctx: Ctx }): ReactNode {
  const elapsed = view.startedAt === undefined || view.lastAt === undefined ? "00:00" : formatElapsed(view.lastAt - view.startedAt);
  const right = `${view.phase}  ${elapsed}  ${Math.round(view.credits)} credits`;
  const titleWidth = Math.max(8, ctx.width - right.length - 12);
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" width={ctx.width}>
        <Box>
          <T ctx={ctx} tone="brand" bold>
            THESEUS
          </T>
          <Text>{"  "}</Text>
          <T ctx={ctx} bold>
            {truncate(view.title, titleWidth)}
          </T>
        </Box>
        <Box>
          <T ctx={ctx} tone={view.done ? "pass" : "running"}>
            {view.phase}
          </T>
          <T ctx={ctx} tone="muted">{`  ${elapsed}  ${Math.round(view.credits)} credits`}</T>
        </Box>
      </Box>
      {view.phaseDetail === undefined || view.done ? null : <T ctx={ctx} tone="muted">{truncate(view.phaseDetail, ctx.width)}</T>}
      <Rule ctx={ctx} />
    </Box>
  );
}

function Spinner({ ctx }: { ctx: Ctx }): ReactNode {
  const { frame } = useAnimation({ interval: 80 });
  return <T ctx={ctx} tone="running">{SPINNER[frame % SPINNER.length]}</T>;
}

function Cell({ state, ctx }: { state: ReturnType<Lane["cells"]["get"]>; ctx: Ctx }): ReactNode {
  const cell = state ?? "pending";
  if (cell === "running") return <Spinner ctx={ctx} />;
  return <T ctx={ctx} tone={CELL_TONE[cell]}>{CELL_GLYPH[cell]}</T>;
}

function Grid({ lane, behaviors, width, ctx }: { lane: Lane; behaviors: readonly string[]; width: number; ctx: Ctx }): ReactNode {
  return (
    <Box width={width} flexWrap="wrap">
      {behaviors.map((id) => (
        <Cell key={id} state={lane.cells.get(id)} ctx={ctx} />
      ))}
    </Box>
  );
}

function activityTone(lane: Lane): Tone {
  if (lane.activity === "done") return lane.total > 0 && lane.passed === lane.total ? "pass" : "muted";
  if (lane.activity === "waiting") return "muted";
  return "running";
}

function roundText(lane: Lane, maxRounds: number | undefined): string {
  if (lane.isOriginal) return "baseline";
  if (lane.round === 0) return "queued";
  return maxRounds === undefined ? `round ${lane.round}` : `round ${lane.round}/${maxRounds}`;
}

function LaneView({ lane, view, ctx }: { lane: Lane; view: ViewState; ctx: Ctx }): ReactNode {
  const count = `${lane.passed}/${lane.total}`;
  const gridWidth = ctx.compact ? ctx.width - 2 : Math.max(8, ctx.width - LABEL_WIDTH - ROUND_WIDTH - COUNT_WIDTH - ACTIVITY_WIDTH - 4);
  const detailWidth = ctx.width - 4;
  const head = (
    <Box>
      <T ctx={ctx} bold tone={lane.isOriginal ? "brand" : undefined}>
        {pad(lane.label, LABEL_WIDTH)}
      </T>
      <T ctx={ctx} tone="muted">{pad(roundText(lane, view.maxRounds), ROUND_WIDTH)}</T>
      {ctx.compact ? null : <Grid lane={lane} behaviors={view.behaviors} width={gridWidth} ctx={ctx} />}
      <T ctx={ctx} bold tone={lane.total > 0 && lane.passed === lane.total ? "pass" : undefined}>
        {` ${count.padStart(COUNT_WIDTH - 1)}`}
      </T>
      <T ctx={ctx} tone={activityTone(lane)}>{`  ${pad(lane.activity, ACTIVITY_WIDTH - 1)}`}</T>
    </Box>
  );
  return (
    <Box flexDirection="column" marginBottom={1}>
      {head}
      {ctx.compact ? (
        <Box paddingLeft={2}>
          <Grid lane={lane} behaviors={view.behaviors} width={gridWidth} ctx={ctx} />
        </Box>
      ) : null}
      {lane.remark === undefined || lane.activity === "done" ? null : (
        <Box paddingLeft={2}>
          <T ctx={ctx} tone="brand">
            kane{" "}
          </T>
          <T ctx={ctx} tone="muted">{truncate(lane.remark, detailWidth - 5)}</T>
        </Box>
      )}
      {lane.activity === "done"
        ? null
        : lane.agentTail.map((line, index) => (
            <Box key={`${index}-${line}`} paddingLeft={2}>
              <T ctx={ctx} tone="muted">{`│ ${truncate(line, detailWidth - 2)}`}</T>
            </Box>
          ))}
    </Box>
  );
}

function Logs({ view, ctx }: { view: ViewState; ctx: Ctx }): ReactNode {
  if (view.logs.length === 0) return null;
  return (
    <Box flexDirection="column">
      <Rule ctx={ctx} />
      {view.logs.map((log, index) => (
        <Box key={`${index}-${log.message}`}>
          <T ctx={ctx} tone={log.level === "error" ? "fail" : log.level === "warn" ? "running" : "muted"}>
            {pad(log.level, 6)}
          </T>
          <T ctx={ctx}>{truncate(log.message, ctx.width - 6)}</T>
        </Box>
      ))}
    </Box>
  );
}

const VERDICT_TONE: Record<SummaryRow["verdict"], Tone> = { identical: "pass", partial: "running", failed: "fail", original: "brand" };

function Summary({ view, voyage, ctx }: { view: ViewState; voyage: Voyage | undefined; ctx: Ctx }): ReactNode {
  const rows = summaryRows(view, voyage);
  const columns = ctx.compact
    ? ([["Target", 14], ["Proven", 8], ["Parity", 20]] as const)
    : ([["Target", 18], ["Rounds", 10], ["Proven", 10], ["Parity", 24], ["Credits", 9]] as const);
  const cells = (row: SummaryRow): string[] =>
    ctx.compact ? [row.label, row.proven, row.parity] : [row.label, row.rounds, row.proven, row.parity, row.credits];
  return (
    <Box flexDirection="column" marginTop={1}>
      <T ctx={ctx} bold>
        Parity certificate
      </T>
      <Box>
        {columns.map(([name, width]) => (
          <T key={name} ctx={ctx} tone="muted">
            {pad(name, width)}
          </T>
        ))}
      </Box>
      {rows.map((row) => (
        <Box key={row.id}>
          {cells(row).map((value, index) => (
            <T key={columns[index]?.[0] ?? index} ctx={ctx} tone={index === 3 || (ctx.compact && index === 2) ? VERDICT_TONE[row.verdict] : undefined}>
              {pad(value, columns[index]?.[1] ?? 10)}
            </T>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function Races({ voyage, ctx }: { voyage: Voyage | undefined; ctx: Ctx }): ReactNode {
  const tables = raceTables(voyage);
  if (tables.length === 0) return null;
  const columns = ctx.compact
    ? ([["Agent", 13], ["To green", 14], ["Parity", 16]] as const)
    : ([["Agent", 14], ["Target", 18], ["To green", 16], ["Proven", 9], ["Parity", 18], ["Credits", 9]] as const);
  const cells = (row: RaceRow): string[] =>
    ctx.compact ? [row.agent, row.toGreen, row.parity] : [row.agent, row.targetId, row.toGreen, row.passed, row.parity, row.credits];
  return (
    <Box flexDirection="column">
      {tables.map((table) => (
        <Box key={table.title} flexDirection="column" marginTop={1}>
          <Box>
            <T ctx={ctx} bold>
              Agent race
            </T>
            <T ctx={ctx} tone="muted">{`  ${truncate(table.title, ctx.width - 12)}`}</T>
          </Box>
          <Box>
            {columns.map(([name, width]) => (
              <T key={name} ctx={ctx} tone="muted">
                {pad(name, width)}
              </T>
            ))}
          </Box>
          {table.rows.map((row) => (
            <Box key={row.targetId}>
              {cells(row).map((value, index) => (
                <T key={columns[index]?.[0] ?? index} ctx={ctx} tone={row.winner ? "pass" : undefined} bold={row.winner && index === 0}>
                  {pad(value, columns[index]?.[1] ?? 10)}
                </T>
              ))}
              {row.winner ? (
                <T ctx={ctx} tone="pass">
                  winner
                </T>
              ) : null}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function App({ store, color }: { store: ViewStore; color: boolean }): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { columns } = useWindowSize();
  const width = Math.max(40, Math.min(columns, MAX_WIDTH) - 1);
  const ctx: Ctx = { color, width, compact: width < 84 };
  const { view, ending } = snapshot;
  return (
    <Box flexDirection="column" paddingX={0}>
      <Header view={view} ctx={ctx} />
      {view.lanes.map((lane) => (
        <LaneView key={lane.id} lane={lane} view={view} ctx={ctx} />
      ))}
      <Logs view={view} ctx={ctx} />
      {ending === undefined ? null : ending.error === undefined ? (
        <Box flexDirection="column">
          <Summary view={view} voyage={ending.voyage} ctx={ctx} />
          <Races voyage={ending.voyage} ctx={ctx} />
        </Box>
      ) : (
        <Box marginTop={1}>
          <T ctx={ctx} tone="fail" bold>
            {`stopped: ${ending.error}`}
          </T>
        </Box>
      )}
    </Box>
  );
}
