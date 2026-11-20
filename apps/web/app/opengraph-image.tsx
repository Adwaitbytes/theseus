import { heroVoyage } from "@/lib/data";
import { OgMatrix, ogSize, renderOg } from "@/lib/og";
import type { OgCell } from "@/lib/og";
import { buildReplay, snapshotAt } from "@/lib/replay";
import { site } from "@/lib/site";

export const alt = `${site.name}: ${site.line}`;
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  const { voyage, events, sample } = heroVoyage();
  const replay = buildReplay(voyage, events);
  const snap = snapshotAt(replay, replay.frames.length);
  const rows: OgCell[][] = snap.cells.map((row) => row.map((c) => (c.state === "passed" ? "passed" : c.state === "failed" ? "failed" : "pending")));
  return renderOg({
    title: (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span>Delete the code.</span>
        <span>Keep the ship.</span>
      </div>
    ),
    subtitle: `${voyage.title}: ${snap.proven} of ${replay.rows.length} behaviors proven on the original and every regrowth.`,
    sample,
    children: <OgMatrix rows={rows} labels={replay.columns.map((c) => (c.original ? "original" : c.label))} />,
  });
}
