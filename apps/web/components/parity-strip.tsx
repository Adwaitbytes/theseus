import type { ParityVerdict } from "@theseus/schema";
import { verdictLabel } from "@/lib/format";

/** One square per behavior, in spec order: the certificate at a glance. */
export function ParityStrip({ verdicts }: { verdicts: { id: string; verdict: ParityVerdict }[] }) {
  return (
    <ul className="flex flex-wrap gap-[3px]" aria-label="Verdict per behavior">
      {verdicts.map((v) => (
        <li
          key={v.id}
          title={`${v.id}: ${verdictLabel[v.verdict]}`}
          className={`size-2.5 rounded-[1.5px] ${
            v.verdict === "identical" ? "bg-pass" : v.verdict === "diverged" ? "hatch border border-ink-2" : "bg-fail"
          }`}
        >
          <span className="sr-only">
            {v.id}: {verdictLabel[v.verdict]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Pass or fail per behavior for one round. */
export function RoundStrip({ results }: { results: { id: string; passed: boolean }[] }) {
  return (
    <span className="flex flex-wrap gap-[2px]" aria-hidden="true">
      {results.map((r) => (
        <span key={r.id} className={`size-1.5 rounded-[1px] ${r.passed ? "bg-pass" : "bg-fail"}`} />
      ))}
    </span>
  );
}
