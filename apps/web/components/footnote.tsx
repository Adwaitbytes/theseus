import { footnote } from "@/lib/site";

/** Superscript reference to a numbered note in the site footer. */
export function Ref({ id }: { id: string }) {
  const f = footnote(id);
  return (
    <a href={`#fn-${f.id}`} className="footnote-ref" aria-label={`Note ${f.n}`}>
      {f.n}
    </a>
  );
}
