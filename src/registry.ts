import type { Command } from "commander";
import { ZtError } from "./errors.js";
import type { CliContext, CommandPlugin } from "./types.js";

export class CommandRegistry {
  private readonly plugins: CommandPlugin[] = [];

  add(plugin: CommandPlugin): this {
    if (this.plugins.some((item) => item.name === plugin.name)) {
      throw new ZtError(`plugin "${plugin.name}" is already registered`, "PLUGIN_DUP");
    }
    this.plugins.push(plugin);
    return this;
  }

  list(): CommandPlugin[] {
    return [...this.plugins];
  }

  apply(program: Command, ctx: CliContext): void {
    for (const plugin of this.plugins) plugin.register(program, ctx);
  }
}
