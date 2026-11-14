import { Command } from "commander";

/**
 * Flags accepted on the root command and on every leaf.
 * Leaves need their own copy so Commander does not reject a flag that follows the subcommand.
 */
export function sharedOptions(command: Command): Command {
  return command
    .option("--json", "print machine-readable JSON")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .option("--config <path>", "config file (default: ~/.ztrc)");
}
