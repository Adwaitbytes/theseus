import Link from "next/link";
import { SampleBadge } from "./sample-badge";
import { ThemeToggle } from "./theme-toggle";
import { Mark } from "./mark";

export function SiteHeader({ voyageId, sample }: { voyageId: string; sample: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <div className="wrap flex h-14 items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-sm text-ink no-underline" aria-label="Theseus, home">
          <Mark className="size-5" />
          <span className="font-serif text-xl leading-none tracking-[-0.01em]">Theseus</span>
        </Link>
        {sample ? (
          <span className="hidden sm:contents">
            <SampleBadge />
          </span>
        ) : null}
        <nav aria-label="Primary" className="ml-auto flex items-center gap-1 text-sm">
          <Link href={`/voyages/${voyageId}`} className="rounded-md px-2 py-2 text-ink-2 no-underline transition-colors duration-150 hover:text-ink">
            Certificate
          </Link>
          <Link href="/method" className="rounded-md px-2 py-2 text-ink-2 no-underline transition-colors duration-150 hover:text-ink">
            Method
          </Link>
          <ThemeToggle />
        </nav>
      </div>
      {sample ? (
        <div className="wrap flex h-10 items-center gap-3 border-t border-rule text-2xs text-ink-2 sm:hidden">
          <SampleBadge />
          Numbers below come from a fixture.
        </div>
      ) : null}
    </header>
  );
}
