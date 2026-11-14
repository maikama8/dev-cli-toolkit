import type { Command } from "commander";
import { checkUuid, formatUuidCheck, generateUuid } from "../lib/uuid.js";
import { positiveInt } from "../process.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

/** `zt uuid` generates UUID v4 values. `zt uuid validate` checks one. */
export const uuidPlugin: CommandPlugin = {
  name: "uuid",
  description: "Generate or validate UUIDs",
  register(program: Command, ctx: CliContext) {
    const uuid = program
      .command("uuid")
      .description("Generate UUID v4 values, or validate one")
      .addHelpText(
        "after",
        `
\`zt uuid\` with no subcommand generates one UUID. Use \`generate --count\` for more.
`,
      );

    const generate = uuid
      .command("generate", { isDefault: true })
      .description("Generate UUID v4 values")
      .option("-n, --count <count>", "how many to generate (1-100)", "1")
      .addHelpText(
        "after",
        `
Examples:
  $ zt uuid
  $ zt uuid generate --count 5
`,
      );
    sharedOptions(generate).action((opts: { count?: string }) => {
      const count = positiveInt(opts.count ?? "1", "count");
      if (count > 100) ctx.output.fail("UUID_COUNT", "count must be from 1 to 100");
      const uuids = Array.from({ length: count }, () => generateUuid());
      ctx.output.ok({ uuids }, uuids.join("\n"));
    });

    const validate = uuid
      .command("validate")
      .description("Check whether a string is a UUID")
      .argument("<uuid>", "value to check")
      .addHelpText(
        "after",
        `
Examples:
  $ zt uuid validate 00000000-0000-0000-0000-000000000000
`,
      );
    sharedOptions(validate).action((value: string) => {
      const check = checkUuid(value);
      const human = formatUuidCheck(check, ctx.output.paint);
      if (!check.valid) ctx.output.fail("UUID_INVALID", human, check, human);
      ctx.output.ok(check, human);
    });
  },
};
