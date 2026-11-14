import type { Command } from "commander";
import { readStdinText } from "../lib/input.js";
import { decodeJwt, formatJwt } from "../lib/jwt.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

/** `zt jwt decode` prints a token without checking its signature. */
export const jwtPlugin: CommandPlugin = {
  name: "jwt",
  description: "Decode a JWT without verifying its signature",
  register(program: Command, ctx: CliContext) {
    const jwt = program.command("jwt").description("Decode a JWT without verifying its signature");
    const decode = jwt
      .command("decode")
      .description("Print the header and payload. The signature is not checked")
      .argument("[token]", "compact JWT; omit to read stdin")
      .addHelpText(
        "after",
        `
Examples:
  $ zt jwt decode "$TOKEN"

This does not verify the signature, the issuer, or the audience. Do not treat the payload as authenticated.
`,
      );
    sharedOptions(decode).action(async (token?: string) => {
      const compact = token ?? (await readStdinText(ctx)).trim();
      const report = decodeJwt(compact, ctx.now());
      ctx.output.ok(report, formatJwt(report, ctx.output.paint));
    });
  },
};
