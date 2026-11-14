import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ZtError } from "../errors.js";
import type { CliContext } from "../types.js";

export async function readFileOrStdin(ctx: CliContext, file?: string): Promise<string> {
  if (!file || file === "-") return readStdinText(ctx);
  return readText(ctx, file);
}

export async function readText(ctx: CliContext, file: string): Promise<string> {
  try {
    return await readFile(resolve(ctx.cwd, file), "utf8");
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") throw new ZtError(`file not found: ${file}`, "NOT_FOUND");
    throw new ZtError(`could not read ${file}: ${error.message}`, "READ_FAILED");
  }
}

export async function readStdinText(ctx: CliContext): Promise<string> {
  const text = await ctx.readStdin();
  if (text.length === 0) {
    throw new ZtError("no input (pass a file or an argument, or pipe stdin)", "NO_INPUT");
  }
  return text;
}
