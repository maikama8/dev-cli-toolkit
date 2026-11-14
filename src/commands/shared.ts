import { Command } from "commander";

export function sharedOptions(command: Command): Command {
  return command
    .option("--json", "print machine-readable JSON")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .option("--config <path>", "config file (default: ~/.ztrc)");
}
