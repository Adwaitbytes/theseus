/** Every error the engine raises on purpose carries a stable code so the CLI can map it to an exit status and a message. */
export type TheseusErrorCode =
  | "config-invalid"
  | "file-invalid"
  | "agent-failed"
  | "agent-output-invalid"
  | "process-failed"
  | "app-start-failed"
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

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof TheseusError && error.code === "aborted") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new TheseusError("aborted", "operation aborted");
}
