import type { Command } from "commander";
import {
  assertKillable,
  findListeners,
  formatKill,
  formatListeners,
  parsePort,
} from "../lib/port.js";
import { createReadlinePrompter } from "../lib/prompt.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";

export const portPlugin: CommandPlugin = {
  name: "port",
  description: "Show or stop the process listening on a TCP port",
  register(program: Command, ctx: CliContext) {
    const port = program
      .command("port")
      .description("Show or stop the process listening on a TCP port");

    const who = port
      .command("who")
      .description("Show which process listens on a port")
      .argument("<port>", "port number")
      .addHelpText(
        "after",
        `
Examples:
  $ zt port who 3000
  $ zt port who 3000 --json

Linux tries ss, then lsof. macOS uses lsof. Windows uses netstat. Only TCP listeners are reported.
`,
      );
    sharedOptions(who).action(async (value: string) => {
      const number = parsePort(value);
      const owners = await findListeners(ctx, number);
      ctx.output.ok({ port: number, owners }, formatListeners(number, owners, ctx.output.paint));
    });

    const kill = port
      .command("kill")
      .description("Stop the process listening on a port")
      .argument("<port>", "port number")
      .option("-y, --yes", "kill without a confirmation prompt")
      .addHelpText(
        "after",
        `
Examples:
  $ zt port kill 3000 --yes

The current process and pid 1 are never signalled. On Windows this runs taskkill. Elsewhere it sends SIGTERM.
`,
      );
    sharedOptions(kill).action(async (value: string, opts: { yes?: boolean }) => {
      const number = parsePort(value);
      const owners = await findListeners(ctx, number);
      if (owners.length === 0) {
        ctx.output.ok({ port: number, killed: [] }, formatKill(number, [], false));
        return;
      }
      for (const owner of owners) assertKillable(owner.pid, ctx.selfPid);
      if (!opts.yes) {
        const preview = owners.map((owner) => `${owner.command} pid ${owner.pid}`).join(", ");
        if (!ctx.isTTY) {
          ctx.output.fail(
            "KILL_CONFIRM",
            `pass --yes to kill ${preview} on port ${number}`,
            { port: number, owners },
          );
        }
        const prompter = ctx.prompter ?? createReadlinePrompter();
        let answer = "n";
        try {
          answer = await prompter.ask(`kill ${preview} on port ${number}?`, "n");
        } finally {
          prompter.close?.();
        }
        if (!/^y(es)?$/i.test(answer.trim())) {
          ctx.output.ok({ port: number, killed: [] }, "left the process running");
          return;
        }
      }
      const killed: number[] = [];
      const errors: string[] = [];
      for (const owner of owners) {
        try {
          await ctx.kill(owner.pid);
          killed.push(owner.pid);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      if (errors.length > 0) {
        ctx.output.fail("KILL_FAILED", errors.join("; "), { port: number, killed, errors });
      }
      ctx.output.ok({ port: number, killed }, formatKill(number, killed, false));
    });
  },
};
