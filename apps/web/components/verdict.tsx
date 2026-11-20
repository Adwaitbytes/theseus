import type { ParityVerdict } from "@theseus/schema";
import { verdictLabel } from "@/lib/format";

type Mark = ParityVerdict | "original" | "passed" | "failed";

/** Verdict glyph: square for identical or passed, crossed square for failed, hatched for diverged. */
export function VerdictGlyph({ verdict, className = "" }: { verdict: Mark; className?: string }) {
  if (verdict === "diverged") {
    return <span aria-hidden="true" className={`hatch inline-block size-3.5 shrink-0 rounded-[2px] border border-ink-2 ${className}`} />;
  }
  if (verdict === "original") {
    return <span aria-hidden="true" className={`inline-block size-3.5 shrink-0 rounded-[2px] border-2 border-ink ${className}`} />;
  }
  const state = verdict === "identical" || verdict === "passed" ? "passed" : "failed";
  return <span aria-hidden="true" className={`glyph inline-block shrink-0 ${className}`} data-state={state} />;
}

export function VerdictTag({ verdict }: { verdict: ParityVerdict }) {
  const tone =
    verdict === "identical" ? "text-pass" : verdict === "diverged" ? "text-ink" : "text-fail";
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${tone}`}>
      <VerdictGlyph verdict={verdict} />
      {verdictLabel[verdict]}
    </span>
  );
}
