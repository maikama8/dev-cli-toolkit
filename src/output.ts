import { ZtError } from "./errors.js";
import { createPaint, type Paint } from "./paint.js";

export interface Writer {
  write(chunk: string): void;
}

export interface CommandResult {
  ok: boolean;
  exitCode: number;
  code?: string;
  message?: string;
  data?: unknown;
  human: string;
}

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

  setMode(mode: { json?: boolean; color?: boolean }): void {
    if (mode.json !== undefined) this.json = mode.json;
    if (mode.color !== undefined) this.color = mode.color;
  }

  get isJson(): boolean {
    return this.json;
  }

  get paint(): Paint {
    return createPaint(this.color && !this.json);
  }

  ok(data: unknown, human: string): void {
    this.write({ ok: true, exitCode: 0, data, human });
  }

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
