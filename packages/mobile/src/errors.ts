export type MobileErrorCode =
  | "android-sdk-missing"
  | "java-missing"
  | "no-avd"
  | "xcode-missing"
  | "cocoapods-missing"
  | "no-simulator"
  | "no-device"
  | "device-boot-timeout"
  | "invalid-project"
  | "dependencies-failed"
  | "prebuild-failed"
  | "signing-failed"
  | "build-failed"
  | "artifact-missing"
  | "install-failed"
  | "launch-failed"
  | "command-not-found"
  | "command-failed"
  | "timeout"
  | "aborted";

/**
 * Every failure in this package surfaces as a MobileError with a stable code and a
 * remedy a human or an agent can act on without reading the stack trace.
 */
export class MobileError extends Error {
  override readonly name = "MobileError";
  /** The last lines of tool output, for failures where the tool's own message is the evidence. */
  readonly logTail: string;

  constructor(
    readonly code: MobileErrorCode,
    message: string,
    readonly remedy: string,
    options?: { readonly cause?: unknown; readonly logTail?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.logTail = options?.logTail ?? "";
  }
}

export function isMobileError(value: unknown): value is MobileError {
  return value instanceof MobileError;
}
