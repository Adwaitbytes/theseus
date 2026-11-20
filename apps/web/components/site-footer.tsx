import Link from "next/link";
import { footnotes, site } from "@/lib/site";
import { Mark } from "./mark";

export function SiteFooter({ sample }: { sample: boolean }) {
  return (
    <footer className="mt-32 border-t border-rule">
      <div className="wrap grid gap-12 py-16 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Mark className="size-5" />
            <span className="font-serif text-xl leading-none">Theseus</span>
          </div>
          <p className="max-w-xs text-sm text-ink-2">
            An entry to the {site.hackathon}. Built on Kane CLI, Claude Code and Codex.
          </p>
          <nav aria-label="Footer" className="flex gap-4 text-sm">
            <Link href="/" className="link text-ink-2">
              Voyage
            </Link>
            <Link href="/method" className="link text-ink-2">
              Method
            </Link>
          </nav>
        </div>
        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="mb-4 text-sm font-medium text-ink">
            Notes
          </h2>
          <ol className="flex flex-col gap-3">
            {footnotes.map((f) => (
              <li key={f.id} id={`fn-${f.id}`} className="grid scroll-mt-24 grid-cols-[1.5rem_1fr] text-sm text-ink-2 target:text-ink">
                <span className="t-num text-accent">{f.n}</span>
                <p>
                  {f.text}{" "}
                  {f.href ? (
                    <a href={f.href} className="link" rel="noopener noreferrer" target="_blank">
                      {f.hrefLabel}
                    </a>
                  ) : null}
                </p>
              </li>
            ))}
            {sample ? (
              <li className="grid grid-cols-[1.5rem_1fr] text-sm text-ink-2">
                <span className="t-num text-accent">{footnotes.length + 1}</span>
                <p>
                  Every number on this site currently comes from a hand-built sample voyage, marked Sample data. It is replaced by
                  recorded Kane runs as soon as they are committed under runs/.
                </p>
              </li>
            ) : null}
          </ol>
        </section>
      </div>
    </footer>
  );
}
