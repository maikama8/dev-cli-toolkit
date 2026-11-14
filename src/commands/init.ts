import type { Command } from "commander";
import {
  formatScaffold,
  formatTemplateList,
  listTemplates,
  scaffoldProject,
} from "../lib/templates.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

/** `zt init` scaffolds a project from a built-in template. */
export const initPlugin: CommandPlugin = {
  name: "init",
  description: "Scaffold a project from a template",
  register(program: Command, ctx: CliContext) {
    const command = program
      .command("init")
      .description("Scaffold a project from a template")
      .argument("[template]", "node-api, react-app, or python-api")
      .argument("[directory]", "target directory", ".")
      .option("--list", "list templates")
      .option("-f, --force", "overwrite existing files")
      .addHelpText(
        "after",
        `
Examples:
  $ zt init --list
  $ zt init node-api my-api
  $ zt init python-api services/billing
`,
      );
    sharedOptions(command).action(
      async (template: string | undefined, directory: string, opts: { list?: boolean; force?: boolean }) => {
        const items = listTemplates();
        if (opts.list) {
          ctx.output.ok({ templates: items }, formatTemplateList(items));
          return;
        }
        if (!template) {
          ctx.output.fail(
            "TEMPLATE",
            `choose a template: ${items.map((item) => item.name).join(", ")}`,
            { templates: items },
            formatTemplateList(items),
          );
        }
        const result = await scaffoldProject({
          template,
          dest: directory,
          force: Boolean(opts.force),
          cwd: ctx.cwd,
        });
        ctx.output.ok(result, formatScaffold(result, ctx.output.paint));
      },
    );
  },
};
