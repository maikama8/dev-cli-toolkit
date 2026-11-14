import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { run, type RunOverrides } from "../src/cli.js";
import type { Prompter } from "../src/types.js";

const emptyHome = join(tmpdir(), "zt-empty-home");

const exec = promisify(execFileCb);

export function capture() {
  let out = "";
  let err = "";
  return {
    stdout: {
      write(chunk: string) {
        out += chunk;
      },
    },
    stderr: {
      write(chunk: string) {
        err += chunk;
      },
    },
    out: () => out,
    err: () => err,
  };
}

/** A prompter that answers from `answers`, then uses the fallback. */
export function scriptedPrompter(answers: string[]): Prompter {
  const pending = [...answers];
  return {
    async ask(_question: string, fallback = "") {
      return pending.shift() ?? fallback;
    },
  };
}

export async function runCli(argv: string[], overrides: RunOverrides = {}) {
  const io = capture();
  const code = await run(argv, {
    isTTY: false,
    stdin: "",
    homeDir: emptyHome,
    stdout: io.stdout,
    stderr: io.stderr,
    ...overrides,
  });
  return { code, out: io.out(), err: io.err() };
}

export function parseJson(text: string): {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
} {
  return JSON.parse(text) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  };
}

export async function gitEnv(dir: string): Promise<NodeJS.ProcessEnv> {
  const globalConfig = join(dir, "gitconfig");
  const systemConfig = join(dir, "gitsystem");
  await writeFile(globalConfig, "");
  await writeFile(systemConfig, "");
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_SYSTEM: systemConfig,
    GIT_AUTHOR_NAME: "Test User",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test User",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
}

export async function initRepo(): Promise<{
  dir: string;
  env: NodeJS.ProcessEnv;
}> {
  const dir = await mkdtemp(join(tmpdir(), "zt-git-"));
  const env = await gitEnv(dir);
  await exec("git", ["init", "-b", "main"], { cwd: dir, env });
  return { dir, env };
}

export async function git(dir: string, env: NodeJS.ProcessEnv, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd: dir, env });
  return String(stdout);
}
