import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ParityRow, Regrowth } from "@theseus/schema";
import { ParityStrip } from "@/components/parity-strip";
import { VerdictGlyph } from "@/components/verdict";
import { getVoyage, loadVoyages } from "@/lib/data";
import { agentLabel, formatCredits, formatDate, formatPercent, platformLabel, verdictLabel } from "@/lib/format";
import { parityScore, summarizeTarget } from "@/lib/stats";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadVoyages().map(({ voyage }) => ({ id: voyage.id }));
}

export async function generateMetadata({ params }: PageProps<"/voyages/[id]">): Promise<Metadata> {
  const { id } = await params;
  const loaded = getVoyage(id);
  if (!loaded) return {};
  const title = `Parity certificate: ${loaded.voyage.title}`;
  const description = `How each regrowth of ${loaded.voyage.title} compares with the original, behavior by behavior, using the values Kane stored.${
    loaded.sample ? " Sample data." : ""
  }`;
  return { title, description, alternates: { canonical: `/voyages/${id}` }, openGraph: { title, description } };
}

export default async function CertificatePage({ params }: PageProps<"/voyages/[id]">) {
  const { id } = await params;
  const loaded = getVoyage(id);
  if (!loaded) notFound();
  const { voyage } = loaded;
  const origin = voyage.spec.app.origin;
  const regrowths = voyage.regrowths;
  const rowsByTarget = new Map(regrowths.map((r) => [r.target.id, new Map((r.parity?.rows ?? []).map((row) => [row.behaviorId, row]))]));
  const issuedAt = regrowths.map((r) => r.endedAt).sort().at(-1);
  const baselineById = new Map(voyage.baseline.map((b) => [b.behaviorId, b]));
  const evidence = regrowths.flatMap((r) =>
    (r.rounds.at(-1)?.results ?? []).filter((x) => x.outcome.testUrl).map((x) => ({ target: r.target, result: x })),
  );

  return (
    <article className="wrap pt-12 sm:pt-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link href="/" className="link">
          Voyage
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span aria-current="page" className="text-ink-2">
          Certificate
        </span>
      </nav>

      <header className="mt-8 grid gap-8 pb-10 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div>
          <h1 className="t-display !text-[clamp(2.75rem,1.6rem+4vw,5rem)]">Parity certificate</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-2">
            {voyage.title}. Every behavior was run on the original and on each regrowth, and the values Kane stored were compared one by one.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-3">Original</dt>
          <dd className="text-ink">
            {origin.label}, {origin.stack}
          </dd>
          <dt className="text-ink-3">Captured</dt>
          <dd className="t-num text-ink">{formatDate(voyage.spec.capturedAt)}</dd>
          {issuedAt ? (
            <>
              <dt className="text-ink-3">Issued</dt>
              <dd className="t-num text-ink">{formatDate(issuedAt)}</dd>
            </>
          ) : null}
          <dt className="text-ink-3">Verified by</dt>
          <dd className="text-ink">Kane CLI, in a real browser and on emulators</dd>
          <dt className="text-ink-3">Behaviors</dt>
          <dd className="t-num text-ink">{voyage.spec.behaviors.length}</dd>
          {voyage.strength ? (
            <>
              <dt className="text-ink-3">Spec strength</dt>
              <dd className="t-num text-ink">
                {formatPercent(voyage.strength.score)}{" "}
                <span className="text-ink-3">
                  ({voyage.strength.killed} of {voyage.strength.total} bugs caught)
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      </header>

      <section aria-labelledby="targets-title" className="border-t-4 border-double border-ink pt-12">
        <h2 id="targets-title" className="sr-only">
          Summary per target
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2 xl:grid-cols-4">
          {regrowths.map((r) => (
            <TargetSeal key={r.id} voyageId={voyage.id} regrowth={r} />
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-2">
          <span className="inline-flex items-center gap-2">
            <VerdictGlyph verdict="identical" /> Identical: passed, and every stored value matches
          </span>
          <span className="inline-flex items-center gap-2">
            <VerdictGlyph verdict="diverged" /> Diverged: passed, but a stored value differs
          </span>
          <span className="inline-flex items-center gap-2">
            <VerdictGlyph verdict="failed-candidate" /> Failed on the regrowth after the last round
          </span>
        </p>
      </section>

      <section aria-labelledby="behaviors-title" className="mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-4">
          <h2 id="behaviors-title" className="t-h3">
            Behavior by behavior
          </h2>
          <p className="text-sm text-ink-2">Values are what Kane stored while running each objective.</p>
        </div>
        <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-2xs text-ink-3">
                <th scope="col" className="sticky left-0 z-10 w-40 bg-paper sm:w-[22%] py-3 pr-4 font-normal">
                  Behavior
                </th>
                <th scope="col" className="w-[22%] py-3 pr-4 font-normal">
                  {origin.label} stored
                </th>
                {regrowths.map((r) => (
                  <th key={r.id} scope="col" className="py-3 pr-4 font-normal">
                    {r.target.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {voyage.spec.behaviors.map((b) => {
                const base = baselineById.get(b.id)?.outcome;
                return (
                  <tr key={b.id} className="align-top">
                    <th scope="row" className="sticky left-0 z-10 border-t border-rule bg-paper py-4 pr-4 text-left font-normal">
                      <span className="block text-ink">{b.title}</span>
                      <span className="mt-1 block font-mono text-2xs text-ink-3">{b.id}</span>
                    </th>
                    <td className="border-t border-rule py-4 pr-4">
                      {base && Object.keys(base.finalState).length > 0 ? (
                        <dl className="flex flex-col gap-1 font-mono text-xs">
                          {b.stores.map((k) => (
                            <div key={k} className="flex flex-wrap gap-x-2">
                              <dt className="text-ink-3">{k}</dt>
                              <dd className="text-ink">{base.finalState[k] ?? "none"}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <span className="text-xs text-ink-3">No stored values</span>
                      )}
                    </td>
                    {regrowths.map((r) => (
                      <td key={r.id} className="border-t border-rule py-4 pr-4">
                        <ParityCell row={rowsByTarget.get(r.target.id)?.get(b.id)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="strength-title" className="mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-4">
          <h2 id="strength-title" className="t-h3">
            Spec strength
          </h2>
          {voyage.strength ? (
            <p className="text-sm text-ink-2">
              <span className="t-num text-ink">{formatPercent(voyage.strength.score)}</span>: {voyage.strength.killed} of {voyage.strength.total}{" "}
              planted bugs caught by at least one behavior.
            </p>
          ) : null}
        </div>
        {voyage.strength ? (
          <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-2xs text-ink-3">
                  <th scope="col" className="w-[28%] py-3 pr-4 font-normal">
                    Planted bug
                  </th>
                  <th scope="col" className="py-3 pr-4 font-normal">
                    Patch
                  </th>
                  <th scope="col" className="w-[26%] py-3 font-normal">
                    Caught by
                  </th>
                </tr>
              </thead>
              <tbody>
                {voyage.strength.mutants.map((m) => (
                  <tr key={m.id} className="align-top">
                    <th scope="row" className="border-t border-rule py-4 pr-4 text-left font-normal">
                      <span className="block text-ink">{m.description}</span>
                      <span className="mt-1 block font-mono text-2xs text-ink-3">{m.id}</span>
                    </th>
                    <td className="border-t border-rule py-4 pr-4">
                      <pre className="overflow-x-auto font-mono text-2xs leading-5 text-ink-2">{m.patch}</pre>
                    </td>
                    <td className="border-t border-rule py-4">
                      {m.killedBy.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {m.killedBy.map((k) => (
                            <li key={k} className="rounded-sm bg-sunken px-1.5 font-mono text-2xs leading-5 text-ink-2">
                              {k}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-fail">
                          <VerdictGlyph verdict="failed" />
                          Survived: no behavior caught it
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 rounded-md border border-dashed border-rule-strong px-5 py-6 text-sm text-ink-2">
            This voyage was run without a strength report, so there is no measure yet of how many bugs the spec would catch.
          </p>
        )}
      </section>

      <section aria-labelledby="evidence-title" className="mt-20">
        <div className="border-b border-rule pb-4">
          <h2 id="evidence-title" className="t-h3">
            Kane evidence
          </h2>
        </div>
        {evidence.length > 0 ? (
          <ul className="mt-2 divide-y divide-rule">
            {evidence.map(({ target, result }) => (
              <li key={`${target.id}-${result.behaviorId}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span className="text-ink-2">
                  {target.label}, <span className="font-mono text-xs">{result.behaviorId}</span>
                </span>
                <a href={result.outcome.testUrl} className="link text-ink" rel="noopener noreferrer" target="_blank">
                  Open the Kane test run
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-md border border-dashed border-rule-strong px-5 py-6 text-sm text-ink-2">
            {loaded.sample
              ? "Links to each Kane test run appear here once a recorded voyage is committed. The sample data has none, on purpose."
              : "This voyage was recorded without Kane test links."}
          </p>
        )}
      </section>
    </article>
  );
}

function TargetSeal({ voyageId, regrowth }: { voyageId: string; regrowth: Regrowth }) {
  const s = summarizeTarget(regrowth);
  const rows = regrowth.parity?.rows ?? [];
  return (
    <li className="flex flex-col gap-5 bg-paper p-6">
      <div>
        <h3 className="font-serif text-2xl leading-tight text-ink">{s.label}</h3>
        <p className="mt-1 text-xs text-ink-3">
          {s.stack}, {platformLabel[s.platform].toLowerCase()}
        </p>
      </div>
      {s.parity ? (
        <div className="flex flex-col gap-3">
          <p className="t-num text-3xl leading-none text-ink">
            {s.parity.identical}
            <span className="text-ink-3">/{s.parity.total}</span>
          </p>
          <p className="text-xs text-ink-2">
            identical ({formatPercent(parityScore(s.parity))}), {s.parity.diverged} diverged, {s.parity.failed} failed
          </p>
          <ParityStrip verdicts={rows.map((r) => ({ id: r.behaviorId, verdict: r.verdict }))} />
        </div>
      ) : (
        <p className="text-sm text-ink-2">No parity report: the regrowth did not finish.</p>
      )}
      <dl className="mt-auto grid grid-cols-2 gap-y-1 border-t border-rule pt-4 text-xs">
        <dt className="text-ink-3">Agent</dt>
        <dd className="text-right text-ink-2">{agentLabel[s.agent.name]}</dd>
        <dt className="text-ink-3">Rounds</dt>
        <dd className="t-num text-right text-ink-2">{s.rounds}</dd>
        <dt className="text-ink-3">Credits</dt>
        <dd className="t-num text-right text-ink-2">{formatCredits(s.credits)}</dd>
      </dl>
      <Link href={`/voyages/${voyageId}/${s.id}`} className="link w-fit text-sm text-ink">
        Replay the {s.rounds} rounds
      </Link>
    </li>
  );
}

function ParityCell({ row }: { row: ParityRow | undefined }) {
  if (!row) return <span className="text-xs text-ink-3">Not run</span>;
  const mismatches = row.values.filter((v) => !v.equal);
  return (
    <div className="flex flex-col gap-2">
      <span
        className={`inline-flex items-center gap-2 text-xs font-medium ${
          row.verdict === "identical" ? "text-pass" : row.verdict === "diverged" ? "text-ink" : "text-fail"
        }`}
      >
        <VerdictGlyph verdict={row.verdict} />
        {row.verdict === "identical" ? <span className="sr-only">{verdictLabel[row.verdict]}</span> : verdictLabel[row.verdict]}
      </span>
      {row.verdict === "diverged" ? (
        <dl className="flex flex-col gap-1 font-mono text-xs">
          {mismatches.map((v) => (
            <div key={v.key} className="flex flex-wrap gap-x-2">
              <dt className="text-ink-3">{v.key}</dt>
              <dd>
                <mark className="diverged-value">{v.candidate ?? "none"}</mark>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {row.verdict === "failed-candidate" ? (
        <p className="font-mono text-2xs leading-5 text-ink-2">{row.candidate.failingStep?.remark ?? row.candidate.oneLiner}</p>
      ) : null}
      {row.verdict === "failed-original" ? <p className="font-mono text-2xs leading-5 text-ink-2">{row.original.oneLiner}</p> : null}
    </div>
  );
}
