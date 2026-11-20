/** Base class for every error @theseus/kane throws, so callers can catch the adapter's failures as one family. */
export class KaneError extends Error {
  override readonly name: string = "KaneError";
}

/** kane-cli has no usable sign-in. Retrying will not help; a person has to run `kane-cli login`. */
export class NotLoggedInError extends KaneError {
  override readonly name = "NotLoggedInError";
}

/** The kane-cli binary could not be started at all (missing, not executable). */
export class KaneSpawnError extends KaneError {
  override readonly name = "KaneSpawnError";
}

/** A kane-cli command exited unsuccessfully or printed output we could not understand. */
export class KaneCommandError extends KaneError {
  override readonly name = "KaneCommandError";
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}

/** The target lacks what its platform needs (a `url` for web, an `app` for mobile). */
export class KaneTargetError extends KaneError {
  override readonly name = "KaneTargetError";
}

/** The caller's AbortSignal fired; the kane-cli process group was killed. */
export class KaneAbortedError extends KaneError {
  override readonly name = "KaneAbortedError";
}
