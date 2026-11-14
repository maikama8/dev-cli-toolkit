import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Paint } from "../paint.js";
import { stripBom } from "../process.js";
import { ZtError } from "../errors.js";

/** Keys in file order, and the last value for each key. */
export interface EnvFile {
  order: string[];
  values: Map<string, string>;
}

/** How an env file differs from its example. `problems` counts missing and empty keys. */
export interface EnvDiff {
  envPath: string;
  examplePath: string;
  missing: string[];
  empty: string[];
  extra: string[];
  ok: string[];
  problems: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse an env file.
 * Accepts `export`, quotes, blank lines, `#` comments, and an inline comment on an unquoted value.
 */
export function parseEnv(text: string): EnvFile {
  const values = new Map<string, string>();
  const order: string[] = [];
  const lines = stripBom(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) {
      throw new ZtError(`invalid env syntax on line ${index + 1}`, "ENV_SYNTAX");
    }
    const name = body.slice(0, eq).trim();
    if (!NAME.test(name)) {
      throw new ZtError(`invalid env name "${name}" on line ${index + 1}`, "ENV_SYNTAX");
    }
    let value = body.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s+#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    if (!values.has(name)) order.push(name);
    values.set(name, value);
  }
  return { order, values };
}

/** Compare `env` with `example`. Extra keys are reported and are not problems. */
export function diffEnv(env: EnvFile, example: EnvFile, envPath: string, examplePath: string): EnvDiff {
  const missing: string[] = [];
  const empty: string[] = [];
  const ok: string[] = [];
  for (const key of example.order) {
    if (!env.values.has(key)) missing.push(key);
    else if (env.values.get(key) === "") empty.push(key);
    else ok.push(key);
  }
  const extra = env.order.filter((key) => !example.values.has(key));
  return {
    envPath,
    examplePath,
    missing,
    empty,
    extra,
    ok,
    problems: missing.length + empty.length,
  };
}

/** Format an env diff for a terminal. */
export function formatEnv(diff: EnvDiff, paint: Paint): string {
  const lines = [`${diff.envPath} compared with ${diff.examplePath}`, ""];
  if (diff.missing.length === 0 && diff.empty.length === 0 && diff.extra.length === 0) {
    lines.push(paint.green("matches the example"));
    return lines.join("\n");
  }
  for (const key of diff.missing) lines.push(`${paint.red("missing".padEnd(8))} ${key}`);
  for (const key of diff.empty) lines.push(`${paint.yellow("empty".padEnd(8))} ${key}`);
  for (const key of diff.extra) lines.push(`${paint.dim("extra".padEnd(8))} ${key}`);
  lines.push("");
  if (diff.problems === 0) lines.push(paint.green("no missing or empty keys"));
  else lines.push(`${diff.problems} problem${diff.problems === 1 ? "" : "s"}`);
  return lines.join("\n");
}

/** Read an env file relative to `cwd`. A missing file throws `ENV_MISSING`. */
export async function readEnvFile(cwd: string, file: string): Promise<string> {
  const path = resolve(cwd, file);
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") throw new ZtError(`env file not found: ${file}`, "ENV_MISSING");
    throw new ZtError(`could not read ${file}: ${error.message}`, "ENV_READ");
  }
}

/** Attach the strict flag and whether the command should fail. */
export function envData(diff: EnvDiff, strict: boolean): EnvDiff & { strict: boolean; failed: boolean } {
  const failed = diff.problems > 0 || (strict && diff.extra.length > 0);
  return { ...diff, strict, failed };
}
