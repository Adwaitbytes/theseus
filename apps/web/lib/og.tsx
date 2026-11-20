import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

export const ogSize = { width: 1200, height: 630 };

/** Dark theme values, inlined because the OG renderer has no CSS variables. */
export const og = {
  paper: "#0b0c0e",
  surface: "#121418",
  ink: "#ecedef",
  ink2: "#a5a9b1",
  ink3: "#82868f",
  rule: "#23262d",
  accent: "#8c9eff",
  pass: "#4cc38a",
  fail: "#ff7563",
};

const fontDir = (pkg: string) => join(process.cwd(), "node_modules", "@fontsource", pkg, "files");

async function fonts() {
  const [serif, mono, sans] = await Promise.all([
    readFile(join(fontDir("newsreader"), "newsreader-latin-400-normal.woff")),
    readFile(join(fontDir("ibm-plex-mono"), "ibm-plex-mono-latin-400-normal.woff")),
    readFile(join(fontDir("ibm-plex-sans"), "ibm-plex-sans-latin-400-normal.woff")),
  ]);
  return [
    { name: "Newsreader", data: serif, weight: 400 as const, style: "normal" as const },
    { name: "Plex Mono", data: mono, weight: 400 as const, style: "normal" as const },
    { name: "Plex Sans", data: sans, weight: 400 as const, style: "normal" as const },
  ];
}

function MarkSvg() {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <svg width="34" height="34" viewBox="0 0 20 20">
      {cells.map(({ r, c }) => (
        <rect key={`${r}${c}`} x={1 + c * 6.5} y={1 + r * 6.5} width="5" height="5" rx="1" fill={r === 1 && c === 2 ? og.accent : og.ink} />
      ))}
    </svg>
  );
}

/** Shared frame: wordmark, optional sample label, a serif title and a data panel. */
export async function renderOg({ title, subtitle, sample, children }: { title: ReactNode; subtitle: string; sample: boolean; children?: ReactNode }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: og.paper, color: og.ink, padding: "56px 64px", fontFamily: "Plex Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <MarkSvg />
          <div style={{ fontFamily: "Newsreader", fontSize: 34, letterSpacing: -0.5 }}>Theseus</div>
          {sample ? (
            <div style={{ marginLeft: "auto", display: "flex", fontFamily: "Plex Mono", fontSize: 20, color: og.ink2, border: `1.5px dashed ${og.ink3}`, borderRadius: 999, padding: "6px 16px" }}>
              Sample data
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: 76, lineHeight: 1.0, letterSpacing: -2 }}>{title}</div>
            <div style={{ marginTop: 24, fontSize: 26, lineHeight: 1.4, color: og.ink2, maxWidth: 620 }}>{subtitle}</div>
          </div>
          {children ? <div style={{ display: "flex" }}>{children}</div> : null}
        </div>
      </div>
    ),
    { ...ogSize, fonts: await fonts() },
  );
}

export type OgCell = "passed" | "failed" | "diverged" | "pending";

/** The matrix as tiny squares: one row per behavior, one column per target. */
export function OgMatrix({ rows, labels }: { rows: OgCell[][]; labels: string[] }) {
  const size = Math.min(16, Math.floor(400 / Math.max(rows.length, 1)) - 4);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {labels.map((l) => (
          <div key={l} style={{ width: 68, fontFamily: "Plex Mono", fontSize: 12, color: og.ink3, display: "flex", justifyContent: "center" }}>
            {l}
          </div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          {row.map((cell, j) => (
            <div key={j} style={{ width: 68, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: 2,
                  background: cell === "passed" ? og.pass : cell === "failed" ? og.fail : cell === "diverged" ? "transparent" : og.rule,
                  border: cell === "diverged" ? `2px solid ${og.ink2}` : "none",
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
