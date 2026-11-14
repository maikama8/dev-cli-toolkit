import type { Command } from "commander";
import type { ExecFile } from "./exec.js";
import type { Output } from "./output.js";

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

export interface Prompter {
  ask(question: string, fallback?: string): Promise<string>;
  close?(): void;
}

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

export interface CommandPlugin {
  name: string;
  description: string;
  register(program: Command, ctx: CliContext): void;
}
