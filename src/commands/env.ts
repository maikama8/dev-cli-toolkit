import type { Command } from "commander";
import { diffEnv, envData, formatEnv, parseEnv, readEnvFile } from "../lib/env.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

export const envPlugin: CommandPlugin = {
  name: "env",
  description: "Compare env files",
  register(program: Command, ctx: CliContext) {
    const env = program.command("env").description("Compare .env with .env.example");
    const check = env
      .command("check")
      .description("Flag keys that are missing or empty")
      .option("--env <path>", "env file", ".env")
      .option("--example <path>", "example file", ".env.example")
      .option("--strict", "also fail when .env has keys that are not in the example")
      .addHelpText(
        "after",
        `
Examples:
  $ zt env check
  $ zt env check --env .env.test --example .env.example
  $ zt env check --strict --json

Empty means the key is present and blank. Extra keys are reported and do not fail the command unless --strict is set.
`,
      );
    sharedOptions(check).action(
      async (opts: { env?: string; example?: string; strict?: boolean }) => {
        const envPath = opts.env ?? ".env";
        const examplePath = opts.example ?? ".env.example";
        const envFile = parseEnv(await readEnvFile(ctx.cwd, envPath));
        const exampleFile = parseEnv(await readEnvFile(ctx.cwd, examplePath));
        const diff = diffEnv(envFile, exampleFile, envPath, examplePath);
        const data = envData(diff, Boolean(opts.strict));
        const human = formatEnv(diff, ctx.output.paint);
        const count = diff.problems + (opts.strict ? diff.extra.length : 0);
        if (count > 0) {
          ctx.output.fail(
            "ENV_DRIFT",
            `${count} problem${count === 1 ? "" : "s"} in ${envPath}`,
            data,
            human,
          );
        }
        ctx.output.ok(data, human);
      },
    );
  },
};
