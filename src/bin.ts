#!/usr/bin/env node
/** Process entry for the `zt` binary. */
import { run } from "./cli.js";

const code = await run(process.argv.slice(2));
process.exit(code);
