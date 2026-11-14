import type { Command } from "commander";
import { formatHttp, parseHeaders, performHttp, resolveRequest } from "../lib/http.js";
import { positiveInt } from "../process.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export const httpPlugin: CommandPlugin = {
  name: "http",
  description: "Make an HTTP request and print status, timing, and JSON",
  register(program: Command, ctx: CliContext) {
    const command = program
      .command("http")
      .description("Make an HTTP request and print status, timing, and JSON")
      .argument("[methodOrUrl]", "URL, or a method when a second argument is given")
      .argument("[url]", "URL when the first argument is a method")
      .option("-H, --header <header>", "request header, repeatable (Name: value)", collect, [])
      .option("-d, --data <body>", "request body; switches a single-argument call to POST")
      .option("-t, --timeout <ms>", "timeout in milliseconds")
      .option("-i, --include", "print response headers")
      .option("-f, --fail", "exit 1 when the status is 400 or higher")
      .addHelpText(
        "after",
        `
Examples:
  $ zt http https://example.com
  $ zt http POST https://example.com/items -H "content-type: application/json" -d "{\\"id\\":1}"
  $ zt http https://example.com --fail --json

A non-2xx response is still a successful command unless --fail is set. Only http and https URLs are sent.
`,
      );
    sharedOptions(command).action(
      async (
        methodOrUrl: string | undefined,
        url: string | undefined,
        opts: {
          header?: string[];
          data?: string;
          timeout?: string;
          include?: boolean;
          fail?: boolean;
        },
      ) => {
        const target = resolveRequest(methodOrUrl, url, opts.data !== undefined);
        const timeoutMs = opts.timeout ? positiveInt(opts.timeout, "timeout") : ctx.config.http.timeoutMs;
        const report = await performHttp(
          {
            method: target.method,
            url: target.url,
            headers: parseHeaders(opts.header ?? []),
            body: opts.data,
            timeoutMs,
          },
          ctx.fetch,
        );
        const human = formatHttp(report, ctx.output.paint, Boolean(opts.include));
        if (opts.fail && report.status >= 400) {
          ctx.output.fail("HTTP_STATUS", `${report.status} ${report.statusText}`, report, human);
        }
        ctx.output.ok(report, human);
      },
    );
  },
};
