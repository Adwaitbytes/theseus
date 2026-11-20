import type { Metadata } from "next";
import Link from "next/link";
import { Ref } from "@/components/footnote";
import { heroVoyage } from "@/lib/data";

export const metadata: Metadata = {
  title: "Method",
  description: "How Theseus captures behavior, runs clean-room regrowths, measures spec strength, and what a parity certificate does and does not prove.",
  alternates: { canonical: "/method" },
};

const sections = [
  { id: "stages", title: "The four stages" },
  { id: "clean-room", title: "Clean room rules" },
  { id: "parity", title: "What parity proves" },
  { id: "not-proven", title: "What it does not prove" },
  { id: "strength", title: "Spec strength" },
  { id: "limitations", title: "Limitations" },
  { id: "data", title: "The data on this site" },
] as const;

export default function MethodPage() {
  const { voyage, sample } = heroVoyage();
  return (
    <article className="wrap pt-12 sm:pt-16">
      <header className="max-w-3xl border-b border-ink pb-10">
        <h1 className="t-display !text-[clamp(2.75rem,1.6rem+4vw,5rem)]">Method</h1>
        <p className="mt-6 text-lg text-ink-2">
          What Theseus does, the rules each regrowth follows, and how far the results can be trusted. Written for the people who will try to
          poke holes in it.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <ol className="flex flex-col gap-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="grid min-h-9 grid-cols-[1.5rem_1fr] items-center text-ink-2 no-underline transition-colors duration-150 hover:text-ink">
                  <span className="t-num text-2xs text-ink-3">{i + 1}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="t-prose flex max-w-[40rem] flex-col text-ink-2 [&_h2]:mb-5 [&_h2]:mt-16 [&_h2]:scroll-mt-24 [&_h2]:font-serif [&_h2]:text-[1.75rem] [&_h2]:leading-tight [&_h2]:text-ink [&_h2:first-child]:mt-0 [&_p+p]:mt-5 [&_strong]:font-medium [&_strong]:text-ink">
          <h2 id="stages">The four stages</h2>
          <p>
            <strong>Capture.</strong> An agent crawls the running original, its screens, DOM and screenshots, plus any documentation, and drafts
            behaviors as plain-English objectives. Each objective is written so it could drive a browser, an Android emulator or an iOS simulator
            without changes. Kane CLI<Ref id="kane" /> then runs every draft against the original. Drafts that do not pass on the original are
            dropped. What remains is the baseline: behaviors known to be true of the app being replaced.
          </p>
          <p>
            <strong>Strength.</strong> Theseus copies the original, plants a realistic bug in the copy, and runs the spec against it. If any
            behavior fails, the bug was caught. This repeats for every planted bug.
          </p>
          <p>
            <strong>Regrow.</strong> Each target gets its own empty workspace and a builder agent, Claude Code or Codex. After the agent says it is
            done, the app is built and started, Kane runs every behavior, and every failure is sent back with the failing step, the reason, a root
            cause and a suggested fix. This loop repeats until all behaviors pass or a round cap is reached.
          </p>
          <p>
            <strong>Parity.</strong> Every behavior runs once more on the original and on each finished regrowth. Theseus compares the values Kane
            stored during each run and writes a certificate per target.
          </p>

          <h2 id="clean-room">Clean room rules</h2>
          <p>
            A regrowth only counts if the agent could not have copied the original. Each workspace starts empty except for two things: SPEC.md, the
            list of behaviors in plain English, and reference screenshots of the original. The original source is never in the workspace, never in
            the prompt and never in the feedback. Kane&apos;s feedback describes what happened in the running app, not what the original code does.
          </p>
          <p>
            A regrown web app must start with npm install, npm run build and npm run start, and listen on the PORT environment variable. Mobile
            targets must produce an Android .apk and an iOS simulator .app. Kane only ever talks to the running app, the same way a person would.
          </p>

          <h2 id="parity">What parity proves</h2>
          <p>
            A behavior is <strong>identical</strong> on a target when Kane passed it on both the original and the regrowth, and every value Kane
            stored along the way is equal. Stored values are things like the counter text after completing an item, the order of the list, or the
            text of an item after an edit is cancelled.
          </p>
          <p>
            A behavior is <strong>diverged</strong> when both runs pass but a stored value differs. Divergences are shown, never rounded away. On
            TodoMVC, the native apps store the filter as a screen name while the web original stores a URL hash. That is a real difference, and
            whether it matters is a judgment the certificate leaves to you.
          </p>

          <h2 id="not-proven">What it does not prove</h2>
          <p>
            Parity is evidence about the behaviors in the spec, and only those. It does not prove the regrowth is equivalent to the original in
            general. Anything the spec does not describe, such as performance, accessibility, visual detail beyond what Kane checks, or behavior
            under rare timing, is untested by construction.
          </p>
          <p>
            Kane is an AI agent operating a real interface. It can be wrong, and a pass is a strong signal rather than a formal proof. Theseus
            reduces this by requiring every behavior to pass on the original first, and by recording each step Kane took so a person can audit it.
          </p>

          <h2 id="strength">Spec strength</h2>
          <p>
            A spec that passes everything is useless. The strength score is the share of planted bugs that at least one behavior catches. A bug
            that survives is listed on the certificate with its patch, because it marks exactly where the spec is too weak to notice a change.
          </p>
          <p>
            The planted bugs are hand-picked to be realistic: off-by-one counters, a missing trim, a swapped filter, a storage write removed. The
            score measures the spec against those bugs, not against every bug that could exist.
          </p>

          <h2 id="limitations">Limitations</h2>
          <p>
            Behaviors are written for one app at a time, and capture works best on apps with clear, observable state. Agents can still overfit to
            Kane&apos;s feedback, for example by special-casing a test string, so the parity run uses the same objectives but the result is read
            alongside the round history. Mobile runs are slower and run one at a time, which caps how many rounds are affordable. Every Kane run costs
            credits, and the cost of each voyage is shown next to its results.
          </p>
          <p>
            On mobile, platform conventions sometimes conflict with the original. Cancelling an edit with the Escape key has no direct Android
            equivalent, and the agent has to choose one. When that choice fails the objective, the certificate says so.
          </p>

          <h2 id="data">The data on this site</h2>
          {sample ? (
            <p>
              <strong>The numbers currently shown are sample data.</strong> They come from a hand-built fixture with the same shape as a real voyage,
              used so the site can be designed and reviewed before the recorded runs exist. Every page that shows them carries a Sample data
              badge. When a recorded voyage is committed under runs/, the site is rebuilt from it and the fixture is no longer used.
            </p>
          ) : (
            <p>
              Every number on this site is read at build time from the committed voyage files under runs/, validated against the Theseus schema.
              The build fails if any file does not match.
            </p>
          )}
          <p>
            Pages are generated statically from {voyage.title} and its recorded events. Nothing is fetched at view time, and nothing on the site is
            typed in by hand. The{" "}
            <Link href={`/voyages/${voyage.id}`} className="link text-ink">
              parity certificate
            </Link>{" "}
            and each round-by-round replay link back to the evidence Kane produced.
          </p>
        </div>
      </div>
    </article>
  );
}
