/** Every error the engine raises on purpose carries a stable code so the CLI can map it to an exit status and a message. */
export type TheseusErrorCode =
  | "config-invalid"
  | "voyage-locked"
  | "file-invalid"
  | "agent-failed"
  | "agent-output-invalid"
  | "process-failed"
  | "app-start-failed"
  | "state-reset-failed"
  | "baseline-empty"
  | "phase-precondition"
  | "patch-failed"
  | "timeout"
  | "budget-exceeded"
  | "aborted";

export class TheseusError extends Error {
  readonly code: TheseusErrorCode;

  constructor(code: TheseusErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TheseusError";
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * The message plus any remedy and log tail an error carries (as @theseus/mobile build errors do),
 * so a builder agent fed this text can see why a native build failed, not only that it did.
 */
export function errorDetail(error: unknown): string {
  const parts = [errorMessage(error)];
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record["remedy"] === "string" && record["remedy"] !== "") parts.push(`Remedy: ${record["remedy"]}`);
    if (typeof record["logTail"] === "string" && record["logTail"] !== "") parts.push(`Build log (last lines):\n${record["logTail"]}`);
  }
  return parts.join("\n");
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof TheseusError && error.code === "aborted") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new TheseusError("aborted", "operation aborted");
}
