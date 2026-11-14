import { execFile as execFileCb } from "node:child_process";
import { ZtError } from "./errors.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type ExecFile = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export const defaultExecFile: ExecFile = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFileCb(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code: 0 });
          return;
        }
        const err = error as NodeJS.ErrnoException & { code?: number | string };
        if (err.code === "ENOENT") {
          resolve({ stdout: "", stderr: err.message, code: 127 });
          return;
        }
        if (typeof err.code === "number") {
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? err.message),
            code: err.code,
          });
          return;
        }
        reject(new ZtError(err.message, "EXEC_FAILED"));
      },
    );
  });
