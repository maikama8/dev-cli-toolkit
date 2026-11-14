import type { Command } from "commander";
import { defaultTools, formatDoctor, inspectTools } from "../lib/doctor.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

export const doctorPlugin: CommandPlugin = {
  name: "doctor",
  description: "Check the versions of common developer tools",
  register(program: Command, ctx: CliContext) {
    const command = program
      .command("doctor")
      .description("Check the versions of node, npm, git, python, and docker")
      .option("--strict", "exit 1 when a tool is missing or older than the configured minimum")
      .addHelpText(
        "after",
        `
Examples:
  $ zt doctor
  $ zt doctor --strict --json

Minimum versions come from ~/.ztrc under doctor.minVersions. A missing tool is reported; it fails the command only with --strict.
`,
      );
    sharedOptions(command).action(async (opts: { strict?: boolean }) => {
      const tools = await inspectTools(
        defaultTools,
        ctx.config.doctor.minVersions,
        ctx.execFile,
        ctx.env,
      );
      const human = formatDoctor(tools, ctx.output.paint);
      const ready = tools.filter((tool) => tool.status === "ok").length;
      if (opts.strict && ready !== tools.length) {
        ctx.output.fail("DOCTOR", `${tools.length - ready} tools are not ready`, { tools }, human);
      }
      ctx.output.ok({ tools }, human);
    });
  },
};
