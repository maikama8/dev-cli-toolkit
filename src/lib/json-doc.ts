import { ZtError } from "../errors.js";
import { stripBom } from "../process.js";

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(stripBom(text));
  } catch (err) {
    throw new ZtError(`invalid JSON: ${(err as Error).message}`, "JSON_INVALID");
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function minifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  const parts = path.split(".");
  let current = value;
  for (const part of parts) {
    if (part.length === 0) throw new ZtError(`path not found: ${path}`, "PATH_NOT_FOUND");
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(part)) throw new ZtError(`path not found: ${path}`, "PATH_NOT_FOUND");
      const index = Number(part);
      if (current[index] === undefined) throw new ZtError(`path not found: ${path}`, "PATH_NOT_FOUND");
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") {
      throw new ZtError(`path not found: ${path}`, "PATH_NOT_FOUND");
    }
    const record = current as Record<string, unknown>;
    if (!(part in record)) throw new ZtError(`path not found: ${path}`, "PATH_NOT_FOUND");
    current = record[part];
  }
  return current;
}
