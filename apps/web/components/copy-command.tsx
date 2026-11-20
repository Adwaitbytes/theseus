"use client";

import { useEffect, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

export function CopyCommand({ command }: { command: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md border border-rule bg-surface pl-4 pr-1.5">
      <span aria-hidden="true" className="select-none font-mono text-sm text-ink-3">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-3 font-mono text-sm text-ink">{command}</code>
      <button type="button" onClick={copy} className="btn shrink-0 text-ink-2 hover:text-ink" aria-label={`Copy command: ${command}`}>
        <span aria-live="polite" className="t-num w-14 text-right text-xs">
          {state === "copied" ? "Copied" : state === "failed" ? "Blocked" : "Copy"}
        </span>
      </button>
    </div>
  );
}
