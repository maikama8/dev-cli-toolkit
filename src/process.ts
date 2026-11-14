import type { ExecFile } from "./exec.js";
import { ZtError } from "./errors.js";

/** Stop a pid. Windows runs `taskkill /F`. Other platforms send `SIGTERM`. */
export async function defaultKill(
  pid: number,
  platform: NodeJS.Platform,
  execFile: ExecFile,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (platform === "win32") {
    const result = await execFile("taskkill", ["/PID", String(pid), "/F"], { env });
    if (result.code !== 0) {
      throw new ZtError(firstLine(result.stderr) || `could not kill pid ${pid}`, "KILL_FAILED");
    }
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    throw new ZtError((err as Error).message, "KILL_FAILED");
  }
}

/** First non-empty trimmed line, or an empty string. */
export function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

/** Remove a leading UTF-8 BOM. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse a base-10 integer greater than zero. */
export function positiveInt(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ZtError(`${label} must be a positive integer`, "BAD_NUMBER");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ZtError(`${label} must be a positive integer`, "BAD_NUMBER");
  }
  return parsed;
}
