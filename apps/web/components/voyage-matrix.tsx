"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { roundMarks, snapshotAt } from "@/lib/replay";
import type { CellState, ReplayData, ReplayFrame } from "@/lib/replay";

/** A full replay plays in this many seconds regardless of how long the real voyage took. */
const REPLAY_SECONDS = 40;

/** What a cell shows: Kane's verdict, plus the parity result once the replay reaches the end. */
type DisplayState = CellState | "diverged";

const stateLabel: Record<DisplayState, string> = {
  pending: "Not run yet",
  running: "Kane is running it",
  passed: "Passed",
  failed: "Failed",
  diverged: "Passed, but a stored value differs from the original",
};

const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function clock(iso: string | undefined): string {
  return iso ? iso.slice(11, 19) : "--:--:--";
}

function roundLabel(round: number): string {
  return round === 0 ? "Baseline" : `Round ${round}`;
}

interface Pos {
  row: number;
  col: number;
}

export function VoyageMatrix({ data, certificateHref }: { data: ReplayData; certificateHref: string }) {
  const total = data.frames.length;
  const [index, setIndex] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<Pos>({ row: 0, col: 0 });
  const [selected, setSelected] = useState<Pos | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const autoplayed = useRef(false);

  const snap = useMemo(() => snapshotAt(data, index), [data, index]);
  const divergedCells = useMemo(() => new Set(data.diverged), [data]);
  const atEnd = index >= total;
  const displayState = (row: number, col: number): DisplayState => {
    const state = snap.cells[row]![col]!.state;
    return atEnd && state === "passed" && divergedCells.has(`${row}:${col}`) ? "diverged" : state;
  };
  const marks = useMemo(() => roundMarks(data), [data]);

  // Playback: advance by elapsed time so speed is the same at 60 or 120 Hz.
  useEffect(() => {
    if (!playing) return;
    const perSecond = total / REPLAY_SECONDS;
    let last = performance.now();
    let carry = 0;
    let frame = requestAnimationFrame(function step(now) {
      carry += ((now - last) / 1000) * perSecond;
      last = now;
      const advance = Math.floor(carry);
      if (advance > 0) {
        carry -= advance;
        setIndex((i) => {
          const next = Math.min(total, i + advance);
          if (next >= total) setPlaying(false);
          return next;
        });
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  // Replay once when the matrix first scrolls into view. Reduced motion keeps the final state.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (autoplayed.current || !entries.some((e) => e.isIntersecting)) return;
        autoplayed.current = true;
        observer.disconnect();
        setIndex(0);
        setPlaying(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const togglePlay = useCallback(() => {
    autoplayed.current = true;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= total) setIndex(0);
    setPlaying(true);
  }, [playing, index, total]);

  function moveFocus(row: number, col: number) {
    const r = Math.max(0, Math.min(data.rows.length - 1, row));
    const c = Math.max(0, Math.min(data.columns.length - 1, col));
    setFocus({ row: r, col: c });
    setSelected({ row: r, col: c });
    cellRefs.current.get(`${r}:${c}`)?.focus();
  }

  function onGridKey(e: KeyboardEvent<HTMLTableElement>) {
    const { row, col } = focus;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [e.ctrlKey ? 0 : row, 0],
      End: [e.ctrlKey ? data.rows.length - 1 : row, data.columns.length - 1],
    };
    const to = moves[e.key];
    if (!to) return;
    e.preventDefault();
    moveFocus(to[0], to[1]);
  }

  const lastResults = useMemo(() => {
    const out: ReplayFrame[] = [];
    for (let i = Math.min(index, total) - 1; i >= 0 && out.length < 6; i--) {
      const f = data.frames[i]!;
      if (f.state !== "running") out.push(f);
    }
    return out;
  }, [data, index, total]);

  const current = index > 0 ? data.frames[index - 1] : undefined;
  const progress = total === 0 ? 0 : (index / total) * 100;
  const activeCol = current?.col;
  const valueText = current
    ? `${clock(current.at)} UTC, ${data.columns[current.col]!.label}, ${roundLabel(current.round)}`
    : "Start of the voyage";

  const detail = selected ?? (current ? { row: current.row, col: current.col } : null);
  const detailCell = detail ? snap.cells[detail.row]![detail.col]! : null;
  const detailState = detail ? displayState(detail.row, detail.col) : "pending";
  const detailColumn = detail ? data.columns[detail.col]! : null;
  const detailRow = detail ? data.rows[detail.row]! : null;

  return (
    <div ref={sectionRef} className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        <dl className="grid grid-cols-2 border-y border-rule sm:grid-cols-4">
          <Counter label="Behaviors proven everywhere" value={`${snap.proven}`} suffix={`/${data.rows.length}`} />
          <Counter label="Regrowth rounds" value={`${snap.rounds}`} />
          <Counter label="Bugs Kane caught" value={`${snap.bugsCaught}`} />
          <Counter label="Kane credits" value={nf.format(snap.credits)} />
        </dl>

        <div className="border-b border-rule py-3 lg:hidden">
          <Legend />
        </div>

        <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" tabIndex={-1}>
          <table
            role="grid"
            aria-label="Voyage matrix: each behavior on the original and on every regrowth"
            aria-rowcount={data.rows.length + 1}
            aria-colcount={data.columns.length + 1}
            className="w-full table-fixed sm:min-w-[28rem] border-separate border-spacing-0 text-sm"
            onKeyDown={onGridKey}
          >
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-32 bg-paper pb-3 sm:w-[34%] pt-5 pr-3 text-left align-bottom text-2xs font-normal text-ink-3">
                  Behavior
                </th>
                {data.columns.map((c, ci) => (
                  <th key={c.id} scope="col" className="px-0.5 pb-3 sm:px-1 pt-5 text-center align-bottom font-normal">
                    <ColumnHead
                      href={c.original ? certificateHref : `${certificateHref}/${c.id}`}
                      label={c.label}
                      short={c.short}
                      tag={c.original ? "Original" : snap.roundByColumn[ci]! > 0 ? `R${snap.roundByColumn[ci]}` : "Waiting"}
                      active={playing && activeCol === ci}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, ri) => (
                <tr key={r.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-t border-rule bg-paper py-1 pr-2 text-left text-xs font-normal leading-4 text-ink-2 sm:pr-3 sm:text-sm sm:leading-5"
                  >
                    {r.title}
                  </th>
                  {data.columns.map((c, ci) => {
                    const cell = snap.cells[ri]![ci]!;
                    const state = displayState(ri, ci);
                    const isFocus = focus.row === ri && focus.col === ci;
                    const isSelected = selected?.row === ri && selected.col === ci;
                    return (
                      <td key={c.id} role="gridcell" className="border-t border-rule px-0 py-0.5 sm:px-1" aria-selected={isSelected}>
                        <button
                          type="button"
                          ref={(el) => {
                            const key = `${ri}:${ci}`;
                            if (el) cellRefs.current.set(key, el);
                            else cellRefs.current.delete(key);
                          }}
                          tabIndex={isFocus ? 0 : -1}
                          data-selected={isSelected}
                          aria-label={`${r.title} on ${c.label}: ${stateLabel[state]}${cell.state !== "pending" ? `, ${roundLabel(cell.round)}` : ""}`}
                          className="cell-btn"
                          onClick={() => {
                            setFocus({ row: ri, col: ci });
                            setSelected({ row: ri, col: ci });
                          }}
                          onFocus={() => setFocus({ row: ri, col: ci })}
                        >
                          <span className="glyph" data-state={state} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-rule pt-3">
          <button
            type="button"
            onClick={togglePlay}
            className="btn btn-quiet w-28 shrink-0 justify-start"
            aria-label={playing ? "Pause replay" : index >= total ? "Replay from the start" : "Play replay"}
          >
            <PlayIcon playing={playing} />
            <span>{playing ? "Pause" : index >= total ? "Replay" : "Play"}</span>
          </button>
          <div className="relative min-w-0 flex-1">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[7px] top-1/2 h-3 -translate-y-[calc(50%+9px)]">
              {marks.map((m) => (
                <span
                  key={`${m.col}-${m.round}`}
                  className="absolute top-0 h-1.5 w-px bg-ink-3"
                  style={{ left: `${total ? (m.index / total) * 100 : 0}%`, opacity: m.round <= 1 ? 1 : 0.45 }}
                />
              ))}
            </div>
            <input
              type="range"
              className="scrubber"
              min={0}
              max={total}
              step={1}
              value={index}
              aria-label="Replay position"
              aria-valuetext={valueText}
              style={{ ["--progress" as string]: `${progress}%` }}
              onChange={(e) => {
                autoplayed.current = true;
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  togglePlay();
                }
              }}
            />
          </div>
          <span className="t-num hidden w-24 shrink-0 text-right text-xs text-ink-2 sm:block">{clock(snap.at)} UTC</span>
        </div>
      </div>

      <aside className="flex flex-col gap-8 text-sm" aria-label="Matrix details">
        <div className="hidden border-b border-rule pb-4 lg:block">
          <Legend />
        </div>

        <section aria-live="off" className="min-h-44">
          <h3 className="mb-3 text-2xs text-ink-3">{selected ? "Selected" : "Latest change"}</h3>
          {detail && detailCell && detailColumn && detailRow ? (
            <div className="flex flex-col gap-2">
              <p className="font-serif text-xl leading-snug text-ink">{detailRow.title}</p>
              <p className="text-ink-2">
                {detailColumn.label}
                <span className="text-ink-3">, {detailColumn.stack}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="glyph inline-block shrink-0" data-state={detailState} aria-hidden="true" />
                <span className="text-ink">{stateLabel[detailState]}</span>
                {detailCell.state !== "pending" ? <span className="t-num text-xs text-ink-3">{roundLabel(detailCell.round)}</span> : null}
              </p>
              {detailCell.note ? (
                <p className="border-l-2 border-fail pl-3 font-mono text-xs leading-5 text-ink-2">Kane: {detailCell.note}</p>
              ) : null}
              <Link href={detailColumn.original ? certificateHref : `${certificateHref}/${detailColumn.id}`} className="link mt-1 w-fit text-ink-2">
                {detailColumn.original ? "Open the parity certificate" : `Open the ${detailColumn.label} rounds`}
              </Link>
            </div>
          ) : (
            <p className="text-ink-2">Select any cell to see what Kane recorded for that behavior on that target.</p>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-2xs text-ink-3">Log</h3>
          {lastResults.length === 0 ? (
            <p className="font-mono text-xs text-ink-3">Nothing has run yet.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 font-mono text-2xs leading-4">
              {lastResults.map((f, i) => (
                <li key={`${index}-${i}`} className="grid grid-cols-[4.25rem_1fr_auto] gap-2 text-ink-2">
                  <span className="text-ink-3">{clock(f.at)}</span>
                  <span className="truncate">
                    {data.columns[f.col]!.label} {f.round === 0 ? "base" : `R${f.round}`} {data.rows[f.row]!.id}
                  </span>
                  <span className={f.state === "passed" ? "text-pass" : "text-fail"}>{f.state === "passed" ? "pass" : "fail"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function Counter({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1 border-rule py-4 pr-4 [&:not(:first-child)]:sm:border-l [&:not(:first-child)]:sm:pl-5 [&:nth-child(2)]:border-l [&:nth-child(2)]:pl-4 [&:nth-child(4)]:border-l [&:nth-child(4)]:pl-4 [&:nth-child(n+3)]:border-t [&:nth-child(n+3)]:sm:border-t-0">
      <dt className="text-2xs text-ink-3">{label}</dt>
      <dd className="t-num text-2xl leading-none text-ink">
        {value}
        {suffix ? <span className="text-ink-3">{suffix}</span> : null}
      </dd>
    </div>
  );
}

function ColumnHead({
  href,
  label,
  short,
  tag,
  active,
}: {
  href: string;
  label: string;
  short: string;
  tag: string;
  active: boolean;
}) {
  return (
    <Link href={href} tabIndex={-1} className="group/col inline-flex flex-col items-center gap-1 rounded-sm text-ink no-underline sm:px-1">
      <span className="text-xs font-medium leading-4 group-hover/col:underline">
        <span className="text-[0.6875rem] tracking-tight sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={`t-num hidden text-2xs leading-4 sm:block transition-colors duration-150 ${active ? "text-accent" : "text-ink-3"}`}>
        {tag}
      </span>
    </Link>
  );
}

function Legend() {
  const items: { state: DisplayState; label: string }[] = [
    { state: "pending", label: "Not run" },
    { state: "running", label: "Running" },
    { state: "passed", label: "Passed" },
    { state: "failed", label: "Failed" },
    { state: "diverged", label: "Diverged" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs lg:grid-cols-2 lg:text-sm" aria-label="Legend">
      {items.map((i) => (
        <li key={i.state} className="flex items-center gap-2.5 text-ink-2">
          <span className="grid size-4 place-items-center">
            <span className="glyph" data-state={i.state} data-static="" />
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
      {playing ? (
        <>
          <rect x="2.5" y="2" width="3" height="10" rx="0.75" />
          <rect x="8.5" y="2" width="3" height="10" rx="0.75" />
        </>
      ) : (
        <path d="M3.5 2.2v9.6a.6.6 0 0 0 .92.5l7.4-4.8a.6.6 0 0 0 0-1L4.42 1.7a.6.6 0 0 0-.92.5Z" />
      )}
    </svg>
  );
}
