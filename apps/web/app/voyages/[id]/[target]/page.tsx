import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { BehaviorResult, KaneOutcome, Round } from "@theseus/schema";
import { RoundStrip } from "@/components/parity-strip";
import { ScreenshotFrame } from "@/components/screenshot-frame";
import { VerdictGlyph } from "@/components/verdict";
import { evidenceUrl, getRegrowth, getVoyage, loadVoyages, targetRouteParams } from "@/lib/data";
import type { LoadedVoyage } from "@/lib/data";
import { agentLabel, formatClock, formatCredits, formatDate, formatDuration, platformLabel } from "@/lib/format";
import { summarizeTarget } from "@/lib/stats";

export const dynamicParams = false;

export function generateStaticParams() {
  return targetRouteParams();
}

export async function generateMetadata({ params }: PageProps<"/voyages/[id]/[target]">): Promise<Metadata> {
  const { id, target } = await params;
  const loaded = getVoyage(id);
  const regrowth = loaded && getRegrowth(loaded, target);
  if (!loaded || !regrowth) return {};
  const title = `${regrowth.target.label} regrowth, round by round`;
  const description = `${agentLabel[regrowth.agent.name]} regrew ${loaded.voyage.title} in ${regrowth.target.stack} over ${regrowth.rounds.length} rounds while Kane tested every behavior.${
    loaded.sample ? " Sample data." : ""
  }`;
  return { title, description, alternates: { canonical: `/voyages/${id}/${target}` }, openGraph: { title, description } };
}

const passed = (o: KaneOutcome) => o.status === "passed";

export default async function TargetPage({ params }: PageProps<"/voyages/[id]/[target]">) {
  const { id, target } = await params;
  const loaded = getVoyage(id);
  const regrowth = loaded && getRegrowth(loaded, target);
  if (!loaded || !regrowth) notFound();
  const { voyage, events } = loaded;
  const s = summarizeTarget(regrowth);
  const titles = new Map(voyage.spec.behaviors.map((b) => [b.id, b]));
  const baseline = new Map(voyage.baseline.map((b) => [b.behaviorId, b.outcome]));
  const agentNotes = new Map<number, string>();
  for (const e of events) if (e.type === "agent-output" && e.targetId === target) agentNotes.set(e.round, e.text);
  const seconds = (Date.parse(regrowth.endedAt) - Date.parse(regrowth.startedAt)) / 1000;

  return (
    <article className="wrap pt-12 sm:pt-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link href="/" className="link">
          Voyage
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <Link href={`/voyages/${voyage.id}`} className="link">
          Certificate
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span aria-current="page" className="text-ink-2">
          {s.label}
        </span>
      </nav>

      <header className="mt-8 grid gap-8 border-b border-ink pb-10 lg:grid-cols-[3fr_2fr] lg:items-end">
        <div>
          <h1 className="t-display !text-[clamp(2.75rem,1.6rem+4vw,5rem)]">{s.label}</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-2">
            {agentLabel[s.agent.name]} rebuilt {voyage.title} in {s.stack}, from the spec and screenshots alone. Kane ran all {s.total} behaviors
            after every round and sent the failures back.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-3">Agent</dt>
          <dd className="text-ink">
            {agentLabel[s.agent.name]} <span className="font-mono text-xs text-ink-3">{s.agent.model}</span>
          </dd>
          <dt className="text-ink-3">Runs on</dt>
          <dd className="text-ink">{platformLabel[s.platform]}</dd>
          <dt className="text-ink-3">Final round</dt>
          <dd className="t-num text-ink">
            {s.finalPassed} of {s.total} passed
          </dd>
          {s.parity ? (
            <>
              <dt className="text-ink-3">Parity</dt>
              <dd className="t-num text-ink">
                {s.parity.identical} identical, {s.parity.diverged} diverged, {s.parity.failed} failed
              </dd>
            </>
          ) : null}
          <dt className="text-ink-3">Elapsed</dt>
          <dd className="t-num text-ink">
            {formatDuration(seconds)} <span className="text-ink-3">on {formatDate(regrowth.startedAt)}</span>
          </dd>
          <dt className="text-ink-3">Credits</dt>
          <dd className="t-num text-ink">{formatCredits(s.credits)}</dd>
        </dl>
      </header>

      <nav aria-label="Rounds" className="mt-10">
        <ol className="flex gap-px overflow-x-auto rounded-md border border-rule bg-rule">
          {regrowth.rounds.map((round) => {
            const ok = round.results.filter((r) => passed(r.outcome)).length;
            return (
              <li key={round.n} className="min-w-[8.5rem] flex-1 bg-paper">
                <a href={`#round-${round.n}`} className="flex h-full flex-col gap-3 p-4 text-ink no-underline transition-colors duration-150 hover:bg-surface">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="whitespace-nowrap text-sm font-medium">Round {round.n}</span>
                    <span className={`t-num text-xs ${ok === round.results.length ? "text-pass" : "text-ink-2"}`}>
                      {ok}/{round.results.length}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <RoundStrip results={round.results.map((r) => ({ id: r.behaviorId, passed: passed(r.outcome) }))} />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {regrowth.rounds.length === 0 ? (
        <p className="mt-10 rounded-md border border-dashed border-rule-strong px-5 py-6 text-sm text-ink-2">
          This regrowth has no recorded rounds yet.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col">
        {regrowth.rounds.map((round, i) => (
          <RoundSection
            key={round.n}
            round={round}
            isLast={i === regrowth.rounds.length - 1}
            agentNote={agentNotes.get(round.n)}
            loaded={loaded}
            targetLabel={s.label}
            titleOf={(bid) => titles.get(bid)?.title ?? bid}
            baselineOf={(bid) => baseline.get(bid)}
          />
        ))}
      </div>
    </article>
  );
}

function RoundSection({
  round,
  isLast,
  agentNote,
  loaded,
  targetLabel,
  titleOf,
  baselineOf,
}: {
  round: Round;
  isLast: boolean;
  agentNote: string | undefined;
  loaded: LoadedVoyage;
  targetLabel: string;
  titleOf: (id: string) => string;
  baselineOf: (id: string) => KaneOutcome | undefined;
}) {
  const failed = round.results.filter((r) => !passed(r.outcome));
  const ok = round.results.filter((r) => passed(r.outcome));
  const seconds = (Date.parse(round.endedAt) - Date.parse(round.startedAt)) / 1000;

  return (
    <section id={`round-${round.n}`} aria-labelledby={`round-${round.n}-title`} className="scroll-mt-20 border-b border-rule py-14">
      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <header className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <h2 id={`round-${round.n}-title`} className="t-h3">
            Round {round.n}
          </h2>
          <p className={`t-num text-sm ${failed.length === 0 ? "text-pass" : "text-ink"}`}>
            {ok.length} of {round.results.length} passed
            {isLast && failed.length > 0 ? <span className="block text-xs text-ink-2">Round cap reached</span> : null}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-ink-2">
            <dt className="text-ink-3">Started</dt>
            <dd className="t-num">{formatClock(round.startedAt)} UTC</dd>
            <dt className="text-ink-3">Took</dt>
            <dd className="t-num">{formatDuration(seconds)}</dd>
            <dt className="text-ink-3">Diff</dt>
            <dd className="t-num">
              {round.diffStat.files} files, <span className="text-pass">+{round.diffStat.additions}</span>{" "}
              <span className="text-fail">-{round.diffStat.deletions}</span>
            </dd>
            {round.commit ? (
              <>
                <dt className="text-ink-3">Commit</dt>
                <dd className="font-mono">{round.commit}</dd>
              </>
            ) : null}
          </dl>
        </header>

        <div className="flex min-w-0 flex-col gap-8">
          {round.feedback ? (
            <details className="group rounded-md border border-rule bg-surface" open={round.n === 2}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 text-sm text-ink [&::-webkit-details-marker]:hidden">
                Feedback the agent received before this round
                <span aria-hidden="true" className="font-mono text-ink-3 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap border-t border-rule px-5 py-4 font-mono text-xs leading-6 text-ink-2">{round.feedback}</pre>
            </details>
          ) : (
            <p className="text-sm text-ink-2">First round: the agent started from SPEC.md and the reference screenshots only.</p>
          )}

          {agentNote ? (
            <blockquote className="border-l-2 border-accent pl-4 text-sm text-ink-2">
              <span className="mb-1 block text-2xs text-ink-3">Agent&apos;s note</span>
              {agentNote}
            </blockquote>
          ) : null}

          {failed.length > 0 && !failed.some((r) => hasShots(loaded, baselineOf(r.behaviorId), r.outcome)) ? (
            <p className="text-xs text-ink-3">
              {loaded.sample
                ? "The sample data has no screenshots. Recorded runs show the original and the regrowth side by side under each failure."
                : "Kane captured no screenshots for the failures in this round."}
            </p>
          ) : null}

          {failed.map((r) => (
            <FailedBehavior key={r.behaviorId} result={r} title={titleOf(r.behaviorId)} original={baselineOf(r.behaviorId)} loaded={loaded} targetLabel={targetLabel} />
          ))}

          {ok.length > 0 ? (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                <VerdictGlyph verdict="passed" />
                {ok.length} {ok.length === 1 ? "behavior" : "behaviors"} passed
                <span aria-hidden="true" className="font-mono text-ink-3 transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink-2 sm:grid-cols-2">
                {ok.map((r) => (
                  <li key={r.behaviorId} className="flex items-baseline justify-between gap-3 border-b border-rule py-2">
                    <span>{titleOf(r.behaviorId)}</span>
                    <span className="t-num text-2xs text-ink-3">{Math.round(r.outcome.durationS)} s</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function hasShots(loaded: LoadedVoyage, original: KaneOutcome | undefined, o: KaneOutcome): boolean {
  return [original?.artifacts.finalShot, o.artifacts.finalShot, o.artifacts.failShot].some((p) => evidenceUrl(loaded, p) !== undefined);
}

function FailedBehavior({
  result,
  title,
  original,
  loaded,
  targetLabel,
}: {
  result: BehaviorResult;
  title: string;
  original: KaneOutcome | undefined;
  loaded: LoadedVoyage;
  targetLabel: string;
}) {
  const o = result.outcome;
  const missing = "Not captured on this run";
  const shots = [
    evidenceUrl(loaded, original?.artifacts.finalShot),
    evidenceUrl(loaded, o.artifacts.finalShot),
    evidenceUrl(loaded, o.artifacts.failShot),
  ];
  return (
    <article className="rounded-md border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-4">
        <h3 className="flex items-center gap-3 text-base text-ink">
          <VerdictGlyph verdict="failed" />
          {title}
        </h3>
        <span className="font-mono text-2xs text-ink-3">{result.behaviorId}</span>
      </header>
      <div className="grid gap-6 px-5 py-5 xl:grid-cols-2">
        <div className="contents">
          <ol className="flex flex-col gap-2" aria-label="Kane steps">
            {o.steps.map((step) => (
              <li key={step.index} className="grid grid-cols-[1.5rem_1fr] items-baseline gap-2 font-mono text-xs leading-5">
                <span className={step.status === "failed" ? "text-fail" : "text-ink-3"}>{step.index}</span>
                <span className={step.status === "failed" ? "text-fail" : "text-ink-2"}>
                  {step.remark}
                  {step.status === "failed" ? <span className="sr-only"> (failed)</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <dl className="flex flex-col gap-3 border-t border-rule pt-4 text-sm xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <div>
              <dt className="text-2xs text-ink-3">Reason</dt>
              <dd className="text-ink">{o.reason}</dd>
            </div>
            {o.rca ? (
              <>
                <div>
                  <dt className="text-2xs text-ink-3">Root cause</dt>
                  <dd className="text-ink-2">{o.rca.rootCause}</dd>
                </div>
                <div>
                  <dt className="text-2xs text-ink-3">Suggested fix</dt>
                  <dd className="text-ink-2">{o.rca.suggestedFix}</dd>
                </div>
              </>
            ) : null}
            {o.bug ? (
              <div>
                <dt className="text-2xs text-ink-3">Bug Kane filed</dt>
                <dd className="text-ink-2">
                  {o.bug.oneLiner} <span className="font-mono text-2xs text-ink-3">({o.bug.severity})</span>
                </dd>
              </div>
            ) : null}
            {o.testUrl ? (
              <a href={o.testUrl} className="link w-fit text-ink" target="_blank" rel="noopener noreferrer">
                Open the Kane test run
              </a>
            ) : null}
          </dl>
        </div>
      </div>
      {shots.some(Boolean) ? (
        <div className="grid grid-cols-2 gap-3 border-t border-rule px-5 py-5 sm:grid-cols-3">
          <ScreenshotFrame src={shots[0]} caption="Original, final state" missing={missing} />
          <ScreenshotFrame src={shots[1]} caption={`${targetLabel}, final state`} missing={missing} />
          <ScreenshotFrame src={shots[2]} caption={`${targetLabel}, failing step`} tone="fail" missing={missing} />
        </div>
      ) : null}
    </article>
  );
}
