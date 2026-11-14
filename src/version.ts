import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function packageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === "@zarachtech/zt" && parsed.version) return parsed.version;
    } catch {
      // Walk up until the package root. dist/ and src/ do not contain it.
    }
    dir = dirname(dir);
  }
  return "0.0.0";
}

export const version = packageVersion();
