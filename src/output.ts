import { ZtError } from "./errors.js";
import { createPaint, type Paint } from "./paint.js";

/** A writable stream the runner can capture in tests. */
export interface Writer {
  write(chunk: string): void;
}

/** The payload a command hands to the printer. `--json` changes the printer, not this value. */
export interface CommandResult {
  ok: boolean;
  exitCode: number;
  code?: string;
  message?: string;
  data?: unknown;
  human: string;
}

/**
 * Print a command result.
 * Human text goes to stdout. JSON is `{ ok, data }` or `{ ok: false, error, data }` on stdout.
 * An unexpected error in human mode goes to stderr.
 */
export class Output {
  private json: boolean;
  private color: boolean;

  constructor(
    private readonly stdout: Writer,
    private readonly stderr: Writer,
    mode: { json: boolean; color: boolean },
  ) {
    this.json = mode.json;
    this.color = mode.color;
  }

  /** Update JSON or color mode after argv has been inspected. */
  setMode(mode: { json?: boolean; color?: boolean }): void {
    if (mode.json !== undefined) this.json = mode.json;
    if (mode.color !== undefined) this.color = mode.color;
  }

  /** True when the command should print a JSON document. */
  get isJson(): boolean {
    return this.json;
  }

  /** Painters for human output. Color is off in JSON mode. */
  get paint(): Paint {
    return createPaint(this.color && !this.json);
  }

  /** Print a successful result and return. */
  ok(data: unknown, human: string): void {
    this.write({ ok: true, exitCode: 0, data, human });
  }

  /** Print a failure and throw. `human` defaults to `message`. */
  fail(code: string, message: string, data?: unknown, human?: string): never {
    this.write({
      ok: false,
      exitCode: 1,
      code,
      message,
      data,
      human: human ?? message,
    });
    throw new ZtError(message, code, 1, true, data);
  }

  /** Write `result` as JSON or as human text. Does not exit. */
  write(result: CommandResult): void {
    if (this.json) {
      const body: Record<string, unknown> = { ok: result.ok };
      if (result.ok) {
        body.data = result.data ?? null;
      } else {
        body.error = {
          code: result.code ?? "ERROR",
          message: result.message ?? result.human,
        };
        if (result.data !== undefined) body.data = result.data;
      }
      this.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      return;
    }
    const text = result.human.endsWith("\n") ? result.human : `${result.human}\n`;
    this.stdout.write(text);
  }

  /** Print an error that was not a {@link ZtError}. JSON goes to stdout. Human text goes to stderr. */
  unexpected(error: Error): void {
    if (this.json) {
      this.stdout.write(
        `${JSON.stringify(
          { ok: false, error: { code: "UNEXPECTED", message: error.message } },
          null,
          2,
        )}\n`,
      );
      return;
    }
    this.stderr.write(`${error.message}\n`);
  }
}
