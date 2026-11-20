import { getRegrowth, getVoyage, loadVoyages, targetRouteParams } from "@/lib/data";
import { agentLabel } from "@/lib/format";
import { og, ogSize, renderOg } from "@/lib/og";

export const alt = "Theseus regrowth, round by round";
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export function generateStaticParams() {
  return targetRouteParams();
}

export default async function Image({ params }: { params: Promise<{ id: string; target: string }> }) {
  const { id, target } = await params;
  const loaded = getVoyage(id);
  const regrowth = loaded && getRegrowth(loaded, target);
  if (!loaded) throw new Error(`Unknown voyage ${id}`);
  if (!regrowth) {
    return renderOg({ title: "Regrowth pending", subtitle: `${loaded.voyage.title}. Kane has not run a regrowth for this target yet.`, sample: loaded.sample });
  }
  return renderOg({
    title: `${regrowth.target.label}, round by round`,
    subtitle: `${agentLabel[regrowth.agent.name]} regrew ${loaded.voyage.title} in ${regrowth.target.stack}. Kane tested every round.`,
    sample: loaded.sample,
    children: (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 380 }}>
        {regrowth.rounds.map((round) => {
          const ok = round.results.filter((r) => r.outcome.status === "passed").length;
          return (
            <div key={round.n} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: "Plex Mono", fontSize: 18, color: og.ink3, width: 34 }}>R{round.n}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {round.results.map((r) => (
                  <div key={r.behaviorId} style={{ width: 13, height: 13, borderRadius: 2, background: r.outcome.status === "passed" ? og.pass : og.fail }} />
                ))}
              </div>
              <span style={{ fontFamily: "Plex Mono", fontSize: 18, color: og.ink2 }}>{`${ok}/${round.results.length}`}</span>
            </div>
          );
        })}
      </div>
    ),
  });
}
