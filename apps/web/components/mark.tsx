/**
 * The Theseus mark: a three by three voyage matrix. Eight planks are ink,
 * the replaced one is the accent. Same ship, one plank at a time.
 */
export function Mark({ className = "" }: { className?: string }) {
  const cells = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {cells.map(({ r, c }) => (
        <rect
          key={`${r}${c}`}
          x={1 + c * 6.5}
          y={1 + r * 6.5}
          width="5"
          height="5"
          rx="1"
          fill={r === 1 && c === 2 ? "var(--accent)" : "currentColor"}
        />
      ))}
    </svg>
  );
}
