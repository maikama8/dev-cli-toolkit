import type { Command } from "commander";
import { readFileOrStdin } from "../lib/input.js";
import { formatJson, getPath, minifyJson, parseJson } from "../lib/json-doc.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

/** `zt json format`, `zt json minify`, and `zt json get`. */
export const jsonPlugin: CommandPlugin = {
  name: "json",
  description: "Format, minify, or pick a path out of a JSON document",
  register(program: Command, ctx: CliContext) {
    const json = program
      .command("json")
      .description("Format, minify, or pick a path out of a JSON document");

    const format = json
      .command("format")
      .description("Pretty-print JSON from a file or stdin")
      .argument("[file]", "JSON file, or - for stdin")
      .addHelpText(
        "after",
        `
Examples:
  $ zt json format package.json
  $ echo '{"b":1,"a":2}' | zt json format
`,
      );
    sharedOptions(format).action(async (file?: string) => {
      const value = parseJson(await readFileOrStdin(ctx, file));
      ctx.output.ok({ value }, formatJson(value));
    });

    const minify = json
      .command("minify")
      .description("Print JSON on one line")
      .argument("[file]", "JSON file, or - for stdin")
      .addHelpText(
        "after",
        `
Examples:
  $ zt json minify payload.json
`,
      );
    sharedOptions(minify).action(async (file?: string) => {
      const value = parseJson(await readFileOrStdin(ctx, file));
      ctx.output.ok({ value }, minifyJson(value));
    });

    const get = json
      .command("get")
      .description("Print one value addressed by a dotted path")
      .argument("<path>", "dotted path, with numeric segments for arrays")
      .argument("[file]", "JSON file, or - for stdin")
      .addHelpText(
        "after",
        `
Examples:
  $ zt json get user.name account.json
  $ zt json get items.0.id feed.json
`,
      );
    sharedOptions(get).action(async (path: string, file?: string) => {
      const value = getPath(parseJson(await readFileOrStdin(ctx, file)), path);
      const human = typeof value === "string" ? value : formatJson(value);
      ctx.output.ok({ path, value }, human);
    });
  },
};
