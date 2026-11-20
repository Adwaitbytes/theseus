import Link from "next/link";

/** Shown wherever fixture data is on screen, so sample numbers are never read as real. */
export function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/method#data"
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-ink-3 px-2.5 font-mono text-2xs text-ink-2 no-underline transition-colors duration-150 hover:border-ink hover:text-ink ${className}`}
      title="These numbers come from a fixture, not a recorded Kane run. Read why on the method page."
    >
      <span aria-hidden="true" className="size-1.5 rounded-full border border-current" />
      Sample data
    </Link>
  );
}
