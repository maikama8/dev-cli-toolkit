import { Command, CommanderError } from "commander";
import { homedir } from "node:os";
import { Readable } from "node:stream";
import { loadConfig, peekConfigPath } from "./config.js";
import { builtinPlugins } from "./commands/index.js";
import { sharedOptions } from "./commands/shared.js";
import { defaultExecFile, type ExecFile } from "./exec.js";
import { ZtError } from "./errors.js";
import { loadPlugins } from "./lib/plugins.js";
import { Output, type Writer } from "./output.js";
import { resolveColor } from "./paint.js";
import { defaultKill } from "./process.js";
import { CommandRegistry } from "./registry.js";
import type { CliContext, Prompter } from "./types.js";
import { version } from "./version.js";

/** Replacements used by tests. Omitted fields use the real process. */
export interface RunOverrides {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  stdout?: Writer;
  stderr?: Writer;
  stdin?: string;
  fetch?: typeof fetch;
  execFile?: ExecFile;
  now?: () => Date;
  kill?: (pid: number) => Promise<void>;
  selfPid?: number;
  isTTY?: boolean;
  prompter?: Prompter;
}

/**
 * Run `zt` with `argv` (without `node` and the program name).
 * Returns the exit code. Does not call `process.exit`.
 */
export async function run(argv: string[], overrides: RunOverrides = {}): Promise<number> {
  const stdout = overrides.stdout ?? process.stdout;
  const stderr = overrides.stderr ?? process.stderr;
  const env = overrides.env ?? process.env;
  const cwd = overrides.cwd ?? process.cwd();
  const homeDir = overrides.homeDir ?? homedir();
  const platform = overrides.platform ?? process.platform;
  const isTTY = overrides.isTTY ?? Boolean(process.stdout.isTTY);
  const jsonFromArgv = argv.includes("--json");
  const output = new Output(stdout, stderr, { json: jsonFromArgv, color: false });

  try {
    const explicit = peekConfigPath(argv, env);
    const loaded = await loadConfig({ explicit, homeDir, cwd });
    output.setMode({
      color: resolveColor({
        json: jsonFromArgv,
        configColor: loaded.config.color,
        noColorEnv: Boolean(env.NO_COLOR),
        isTTY,
      }),
    });

    const execFile = overrides.execFile ?? defaultExecFile;
    const ctx: CliContext = {
      cwd,
      env,
      homeDir,
      platform,
      config: loaded.config,
      configPath: loaded.path,
      output,
      fetch: overrides.fetch ?? globalThis.fetch,
      execFile,
      now: overrides.now ?? (() => new Date()),
      readStdin: async () => {
        if (overrides.stdin !== undefined) return overrides.stdin;
        return readStream(process.stdin);
      },
      kill: overrides.kill ?? ((pid: number) => defaultKill(pid, platform, execFile, env)),
      selfPid: overrides.selfPid ?? process.pid,
      isTTY,
      prompter: overrides.prompter,
    };

    const registry = new CommandRegistry();
    for (const plugin of builtinPlugins) registry.add(plugin);
    for (const plugin of await loadPlugins(loaded.config.plugins, loaded.path, cwd)) {
      registry.add(plugin);
    }

    const program = new Command();
    program
      .name("zt")
      .description("Zarachtech developer toolkit")
      .version(version, "-v, --version", "print the version")
      .showHelpAfterError("(see --help)")
      .exitOverride();
    program.configureOutput({
      writeOut: (text) => stdout.write(text),
      writeErr: (text) => stderr.write(text),
    });
    sharedOptions(program);
    program.hook("preAction", () => {
      const json = argv.includes("--json");
      output.setMode({
        json,
        color: resolveColor({
          json,
          colorFlag: argv.includes("--color"),
          noColorFlag: argv.includes("--no-color"),
          configColor: loaded.config.color,
          noColorEnv: Boolean(env.NO_COLOR),
          isTTY,
        }),
      });
    });
    program.addHelpText(
      "after",
      `
Examples:
  $ zt init node-api my-api
  $ zt env check
  $ zt git commit --type feat --subject "add health route"
  $ zt port who 3000
  $ zt http https://example.com
  $ zt doctor

Config is read from ~/.ztrc (or ZT_CONFIG, or --config). Pass --json for one JSON document.
`,
    );
    registry.apply(program, ctx);
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    if (err instanceof ZtError) {
      if (!err.emitted) {
        output.write({
          ok: false,
          exitCode: err.exitCode,
          code: err.code,
          message: err.message,
          data: err.data,
          human: err.message,
        });
      }
      if (env.ZT_DEBUG && !output.isJson && err.stack) stderr.write(`${err.stack}\n`);
      return err.exitCode;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    output.unexpected(error);
    if (env.ZT_DEBUG && !output.isJson && error.stack) stderr.write(`${error.stack}\n`);
    return 1;
  }
}

function readStream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}
