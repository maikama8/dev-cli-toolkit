import type { Command } from "commander";
import { ZtError } from "./errors.js";
import type { CliContext, CommandPlugin } from "./types.js";

/** Ordered command plugins. A repeated name throws `PLUGIN_DUP`. */
export class CommandRegistry {
  private readonly plugins: CommandPlugin[] = [];

  /** Register a plugin. Throws `PLUGIN_DUP` when the name is already present. */
  add(plugin: CommandPlugin): this {
    if (this.plugins.some((item) => item.name === plugin.name)) {
      throw new ZtError(`plugin "${plugin.name}" is already registered`, "PLUGIN_DUP");
    }
    this.plugins.push(plugin);
    return this;
  }

  /** A copy of the plugins in registration order. */
  list(): CommandPlugin[] {
    return [...this.plugins];
  }

  /** Call `register` on every plugin. */
  apply(program: Command, ctx: CliContext): void {
    for (const plugin of this.plugins) plugin.register(program, ctx);
  }
}
