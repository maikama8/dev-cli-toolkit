import type { Command } from "commander";
import type { ExecFile } from "./exec.js";
import type { Output } from "./output.js";

/** The parsed `~/.ztrc` document. Unknown keys are dropped. */
export interface ZtConfig {
  color?: boolean;
  plugins: string[];
  git: {
    baseBranch: string;
    protectedBranches: string[];
  };
  http: {
    timeoutMs: number;
  };
  doctor: {
    minVersions: Record<string, string>;
  };
}

/** One question and an answer. `close` releases the terminal when prompting is finished. */
export interface Prompter {
  ask(question: string, fallback?: string): Promise<string>;
  close?(): void;
}

/** Everything a command can use. Commands print through `output`. */
export interface CliContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  platform: NodeJS.Platform;
  config: ZtConfig;
  configPath?: string;
  output: Output;
  fetch: typeof fetch;
  execFile: ExecFile;
  now(): Date;
  readStdin(): Promise<string>;
  kill(pid: number): Promise<void>;
  selfPid: number;
  isTTY: boolean;
  prompter?: Prompter;
}

/** A built-in or user command. `register` adds Commander commands and must not parse argv itself. */
export interface CommandPlugin {
  name: string;
  description: string;
  register(program: Command, ctx: CliContext): void;
}
