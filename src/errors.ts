/**
 * An expected command failure.
 * `emitted` means the message was already written, so the runner must not print it again.
 */
export class ZtError extends Error {
  readonly emitted: boolean;

  constructor(
    message: string,
    readonly code: string,
    readonly exitCode = 1,
    emitted = false,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ZtError";
    this.emitted = emitted;
  }
}
