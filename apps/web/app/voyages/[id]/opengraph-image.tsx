import { getVoyage, loadVoyages } from "@/lib/data";
import { og, ogSize, renderOg } from "@/lib/og";

export const alt = "Theseus parity certificate";
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export function generateStaticParams() {
  return loadVoyages().map(({ voyage }) => ({ id: voyage.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = getVoyage(id);
  if (!loaded) throw new Error(`Unknown voyage ${id}`);
  const { voyage, sample } = loaded;
  return renderOg({
    title: "Parity certificate",
    subtitle: `${voyage.title}, compared value by value with ${voyage.regrowths.length} regrowths.`,
    sample,
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 380 }}>
        {voyage.regrowths.map((r) => {
          const p = r.parity?.summary;
          return (
            <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22 }}>
                <span>{r.target.label}</span>
                <span style={{ fontFamily: "Plex Mono", color: og.ink2 }}>{p ? `${p.identical}/${p.total}` : "n/a"}</span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {(r.parity?.rows ?? []).map((row) => (
                  <div
                    key={row.behaviorId}
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 2,
                      background: row.verdict === "identical" ? og.pass : row.verdict === "diverged" ? "transparent" : og.fail,
                      border: row.verdict === "diverged" ? `2px solid ${og.ink2}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ),
  });
}
