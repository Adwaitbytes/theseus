import Image from "next/image";
import Link from "next/link";
import { CopyCommand } from "@/components/copy-command";
import { Ref } from "@/components/footnote";
import { VerdictGlyph } from "@/components/verdict";
import { VoyageMatrix } from "@/components/voyage-matrix";
import { heroVoyage } from "@/lib/data";
import { formatCredits, formatDuration, formatInt, formatPercent, verdictLabel } from "@/lib/format";
import { pickHighlights } from "@/lib/highlights";
import { buildReplay } from "@/lib/replay";
import { voyageStats } from "@/lib/stats";
import vase from "@/public/art/siren-painter-stamnos.webp";

function listTargets(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export default function HomePage() {
  const loaded = heroVoyage();
  const { voyage, events } = loaded;
  const replay = buildReplay(voyage, events);
  const stats = voyageStats(voyage);
  const h = pickHighlights(voyage);
  const certificateHref = `/voyages/${voyage.id}`;
  const webTargets = voyage.regrowths.filter((r) => r.target.platform === "web").map((r) => r.target.label);
  const nativeTargets = voyage.regrowths.filter((r) => r.target.platform !== "web").map((r) => r.target.label);

  return (
    <>
      <section className="wrap pb-14 pt-14 sm:pt-20" aria-labelledby="hero-title">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-end lg:gap-12">
          <h1 id="hero-title" className="t-display">
            Delete the code.
            <br />
            Keep the ship.
          </h1>
          <p className="max-w-xl text-lg text-ink-2 lg:pb-2">
            Theseus writes down how an app behaves as plain-English Kane CLI tests<Ref id="kane" />, deletes the code, lets AI agents grow it
            back in other stacks, and keeps testing until every version behaves like the original.
          </p>
        </div>
      </section>

      <section className="wrap" aria-labelledby="voyage-title">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 id="voyage-title" className="text-base font-medium text-ink">
            {voyage.title}
            <Ref id="todomvc" />
          </h2>
          <p className="text-sm text-ink-2">
            Regrown in {listTargets(webTargets)}
            {nativeTargets.length > 0 ? `, then as a native Expo app on ${listTargets(nativeTargets)}` : ""}.
          </p>
        </div>
        <VoyageMatrix data={replay} certificateHref={certificateHref} />
      </section>

      <section className="wrap mt-32" aria-labelledby="how-title">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-ink pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <h2 id="how-title" className="t-h2">
            How a voyage works
          </h2>
          <p className="max-w-xl text-ink-2 md:pt-2">
            Four stages, each producing an artifact you can inspect. Everything below was taken from the voyage above, not written for this
            page.
          </p>
        </div>

        <ol className="mt-16 flex flex-col">
          <Step n={1} title="Capture" body={`An agent crawls the running original and drafts behaviors in plain English. Kane runs each one on the original, and only the ones it proves are kept. ${stats.baselinePassed} of ${stats.behaviors} made it into this spec.`}>
            <figure className="rounded-md border border-rule bg-surface">
              <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
                <span className="font-mono text-xs text-ink-2">{h.specimen.id}</span>
                <span className="text-2xs text-ink-3">{h.specimen.area}</span>
              </div>
              <blockquote className="px-5 py-5 font-serif text-xl leading-relaxed text-ink">{h.specimen.objective}</blockquote>
              {h.specimen.stores.length > 0 ? (
                <figcaption className="flex flex-wrap gap-2 border-t border-rule px-5 py-3 text-2xs text-ink-3">
                  Kane stores
                  {h.specimen.stores.map((k) => (
                    <code key={k} className="rounded-sm bg-sunken px-1.5 font-mono text-ink-2">
                      {k}
                    </code>
                  ))}
                </figcaption>
              ) : null}
            </figure>
          </Step>

          <Step
            n={2}
            title="Strength"
            body="Theseus plants realistic bugs in a copy of the original and records which behaviors catch them. A bug that nothing catches is a hole in the spec, so it is reported rather than hidden."
          >
            {stats.strength && h.mutant ? (
              <figure className="rounded-md border border-rule bg-surface">
                <div className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-3">
                  <span className="text-sm text-ink">
                    <span className="t-num text-ink">{formatPercent(stats.strength.score)}</span>
                    <span className="text-ink-2">
                      {" "}
                      strength, {stats.strength.killed} of {stats.strength.total} planted bugs caught
                    </span>
                  </span>
                </div>
                <div className="px-5 py-4">
                  <p className="mb-3 text-sm text-ink-2">
                    {h.mutant.killedBy.length === 0 ? "Survived" : "Caught"}: {h.mutant.description.toLowerCase()}
                  </p>
                  <Patch patch={h.mutant.patch} />
                </div>
              </figure>
            ) : (
              <Empty>This voyage has no strength report yet.</Empty>
            )}
          </Step>

          <Step
            n={3}
            title="Regrow"
            body="Each target starts in an empty clean room holding only SPEC.md and reference screenshots, never the original source. The agent builds, Kane tests, and every failure goes back with the failing step, the root cause and a suggested fix."
          >
            {h.feedback ? (
              <figure className="rounded-md border border-rule bg-surface">
                <figcaption className="border-b border-rule px-5 py-3 text-xs text-ink-2">
                  Feedback for {h.feedback.target.label}, before round {h.feedback.round}
                </figcaption>
                <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-6 text-ink">{h.feedback.text}</pre>
              </figure>
            ) : (
              <Empty>Every target passed on its first round, so no feedback was needed.</Empty>
            )}
          </Step>

          <Step
            n={4}
            title="Parity"
            body="Passing is not the end. Kane stores values while it tests, such as the counter text or the route. Theseus compares them with the original's values and issues a certificate for each target, divergences included."
            last
          >
            {h.parity ? (
              <figure className="rounded-md border border-rule bg-surface">
                <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3 text-xs text-ink-2">
                  <span>
                    {h.parity.behavior.title} on {h.parity.target.label}
                  </span>
                  <span className="inline-flex items-center gap-2 text-ink">
                    <VerdictGlyph verdict={h.parity.verdict} />
                    {verdictLabel[h.parity.verdict]}
                  </span>
                </figcaption>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-5 py-4 font-mono text-sm">
                  <dt className="text-ink-3">key</dt>
                  <dd className="text-ink">{h.parity.value.key}</dd>
                  <dt className="text-ink-3">original</dt>
                  <dd className="text-ink">{h.parity.value.original ?? "none"}</dd>
                  <dt className="text-ink-3">regrown</dt>
                  <dd>
                    <span className={h.parity.value.equal ? "text-ink" : "diverged-value"}>{h.parity.value.candidate ?? "none"}</span>
                  </dd>
                </dl>
              </figure>
            ) : (
              <Empty>No parity report yet.</Empty>
            )}
          </Step>
        </ol>
      </section>

      <section className="wrap mt-32" aria-labelledby="insight-title">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-12 border-t border-ink pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <figure className="lg:sticky lg:top-24">
            <Image
              src={vase}
              alt="Red-figure painting on a Greek vase: Odysseus bound to the mast of a ship while his crew rows past the Sirens."
              sizes="(min-width: 1024px) 34rem, 100vw"
              placeholder="blur"
              className="h-auto w-full rounded-sm"
            />
            <figcaption className="mt-3 text-xs text-ink-3">
              Odysseus and the Sirens, about 480 to 470 BC
              <Ref id="vase" />
            </figcaption>
          </figure>

          <div className="max-w-2xl">
            <h2 id="insight-title" className="t-h2">
              The tests are the ship.
            </h2>
            <div className="t-prose mt-8 flex flex-col gap-6 text-ink-2">
              <p>
                Plutarch tells of the Athenians keeping the ship of Theseus for centuries, replacing each rotten plank with new timber, until
                philosophers could not agree that it was still the same ship.
                <Ref id="plutarch" />
              </p>
              <p>
                Software has the same riddle, and the usual tests do not answer it. Unit tests import functions. Component tests mount
                components. Delete the code and those tests go with it.
              </p>
              <p>
                The sentence below names no file, no framework and no selector. That is why it survived the move from jQuery to {listTargets(webTargets)}, and
                off the web entirely onto {listTargets(nativeTargets) || "native apps"}. Written at the level of intent, tests stop being a check on the
                code and become the part of the app that lasts.
              </p>
            </div>

            <figure className="mt-10 border-y border-rule py-6">
              <blockquote className="font-mono text-sm leading-6 text-ink">{h.specimen.objective}</blockquote>
              <figcaption className="mt-5">
                <span className="sr-only">Parity verdict for this behavior on each target:</span>
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-2">
                  {h.specimenVerdicts.map((v) => (
                    <li key={v.label} className="inline-flex items-center gap-2">
                      <VerdictGlyph verdict={v.verdict} />
                      {v.label}
                      <span className="sr-only">: {v.verdict === "original" ? "the original" : verdictLabel[v.verdict]}</span>
                    </li>
                  ))}
                </ul>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="wrap mt-32" aria-labelledby="numbers-title">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-ink pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col items-start gap-4">
            <h2 id="numbers-title" className="t-h2">
              The log
            </h2>
          </div>
          <dl className="divide-y divide-rule border-b border-rule">
            <LogRow label="Behaviors in the spec" value={formatInt(stats.behaviors)} note="Each proven on the original before any code was deleted." />
            <LogRow
              label="Regrowths"
              value={formatInt(stats.regrowths)}
              note={voyage.regrowths.map((r) => r.target.label).join(", ")}
            />
            <LogRow label="Rounds" value={formatInt(stats.rounds)} note="Build, run every behavior, feed failures back, repeat." />
            <LogRow label="Failures fed back" value={formatInt(stats.failuresFedBack)} note="Each with Kane's failing step, root cause and suggested fix." />
            {stats.strength ? (
              <LogRow
                label="Spec strength"
                value={formatPercent(stats.strength.score)}
                note={`${stats.strength.killed} of ${stats.strength.total} planted bugs caught by at least one behavior.`}
              />
            ) : null}
            <LogRow
              label="Identical behavior"
              value={`${formatInt(stats.parity.identical)}/${formatInt(stats.parity.total)}`}
              note={`Target and behavior pairs whose stored values match the original. ${stats.parity.diverged} diverged, ${stats.parity.failed} failed.`}
            />
            <LogRow label="Kane runs" value={formatInt(stats.kaneRuns)} note={`${formatDuration(stats.kaneSeconds)} of browser and emulator time.`} />
            <LogRow label="Kane credits" value={formatCredits(stats.credits)} note="The baseline plus every round on every target." />
          </dl>
        </div>
      </section>

      <section className="wrap mt-32" aria-labelledby="install-title">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-ink pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <h2 id="install-title" className="t-h2">
            Run a voyage
          </h2>
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <CopyCommand command="npx theseus-cli demo" />
              <p className="text-sm text-ink-2">Replays this voyage in your terminal. No login, no credits.</p>
            </div>
            <div className="flex flex-col gap-3">
              <CopyCommand command="npx theseus-cli voyage ./examples/todomvc-jquery" />
              <p className="text-sm text-ink-2">
                Runs capture, strength, regrowth and parity on a real app. Needs Kane CLI logged in, and Claude Code or Codex on your path.
              </p>
            </div>
            <p className="text-sm text-ink-2">
              Read the{" "}
              <Link href="/method" className="link text-ink">
                method
              </Link>{" "}
              for the clean room rules and what a parity certificate does not prove.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, body, children, last = false }: { n: number; title: string; body: string; children: React.ReactNode; last?: boolean }) {
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)] gap-6 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12 ${last ? "" : "border-b border-rule"}`}>
      <div className="flex gap-4">
        <span className="t-num pt-1 text-sm text-accent" aria-hidden="true">
          {n}
        </span>
        <div>
          <h3 className="t-h3">{title}</h3>
          <p className="mt-3 max-w-sm text-ink-2">{body}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function Patch({ patch }: { patch: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm bg-sunken py-2 font-mono text-xs leading-6">
      {patch.split("\n").map((line, i) => {
        const sign = line[0];
        const tone = sign === "+" ? "text-ink" : sign === "-" ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink-2";
        return (
          <span key={i} className={`block px-3 ${tone}`}>
            <span aria-hidden="true" className="mr-3 inline-block w-2 select-none text-ink-3">
              {sign === "+" || sign === "-" ? sign : " "}
            </span>
            {sign === "+" || sign === "-" ? line.slice(1) : line}
          </span>
        );
      })}
    </pre>
  );
}

function LogRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[12rem_8rem_1fr]">
      <dt className="text-sm text-ink">{label}</dt>
      <dd className="t-num text-right text-xl text-ink sm:text-left">{value}</dd>
      <dd className="col-span-2 text-sm text-ink-2 sm:col-span-1">{note}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-rule-strong px-5 py-6 text-sm text-ink-2">{children}</p>;
}
