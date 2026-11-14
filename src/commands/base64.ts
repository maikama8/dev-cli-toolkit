import type { Command } from "commander";
import { decodeBase64, encodeBase64 } from "../lib/base64.js";
import { readStdinText } from "../lib/input.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

async function textFrom(ctx: CliContext, value?: string): Promise<string> {
  if (value !== undefined) return value;
  return readStdinText(ctx);
}

/** `zt base64 encode` and `zt base64 decode`. */
export const base64Plugin: CommandPlugin = {
  name: "base64",
  description: "Encode and decode base64 text",
  register(program: Command, ctx: CliContext) {
    const base64 = program.command("base64").description("Encode and decode base64 text");

    const encode = base64
      .command("encode")
      .description("Encode text as base64")
      .argument("[text]", "text to encode; omit to read stdin")
      .option("--url", "use base64url without padding")
      .addHelpText(
        "after",
        `
Examples:
  $ zt base64 encode "hello"
  $ zt base64 encode --url "a+b"
`,
      );
    sharedOptions(encode).action(async (text: string | undefined, opts: { url?: boolean }) => {
      const input = await textFrom(ctx, text);
      const encoded = encodeBase64(input, Boolean(opts.url));
      ctx.output.ok({ text: encoded, url: Boolean(opts.url) }, encoded);
    });

    const decode = base64
      .command("decode")
      .description("Decode base64 text")
      .argument("[text]", "text to decode; omit to read stdin")
      .option("--url", "decode base64url")
      .addHelpText(
        "after",
        `
Examples:
  $ zt base64 decode aGVsbG8=
  $ zt base64 decode --url aGVsbG8
`,
      );
    sharedOptions(decode).action(async (text: string | undefined, opts: { url?: boolean }) => {
      const input = await textFrom(ctx, text);
      const decoded = decodeBase64(input, Boolean(opts.url));
      ctx.output.ok({ text: decoded, url: Boolean(opts.url) }, decoded);
    });
  },
};
