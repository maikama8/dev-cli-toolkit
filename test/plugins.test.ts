import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseJson, runCli } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "plugins");
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(here, ".tmp-plugin-"));
  dirs.push(dir);
  return dir;
}

function rel(dir: string, name: string): string {
  return relative(dir, join(fixtures, name)).split("\\").join("/");
}

async function writeConfig(dir: string, name: string, plugin: string): Promise<void> {
  await writeFile(join(dir, name), JSON.stringify({ plugins: [plugin] }));
}

describe("plugins", () => {
  it("loads a plugin from a path relative to the config file", async () => {
    const dir = await temp();
    await writeConfig(dir, ".ztrc", rel(dir, "ping.mjs"));
    const result = await runCli(["ping", "--json"], { homeDir: dir, cwd: dir });
    expect(result.code).toBe(0);
    expect(parseJson(result.out).data?.pong).toBe(true);
  });

  it("reports a missing file, a bad shape, a duplicate name, and an unexpected throw", async () => {
    const dir = await temp();

    await writeConfig(dir, "missing.json", "./nope.mjs");
    const missing = await runCli(["--config", "missing.json", "--json"], { cwd: dir });
    expect(parseJson(missing.out).error?.code).toBe("PLUGIN_LOAD");

    await writeFile(join(dir, "bad.mjs"), "export default {\n");
    await writeConfig(dir, "bad.json", "./bad.mjs");
    const bad = await runCli(["--config", "bad.json", "--json"], { cwd: dir });
    expect(parseJson(bad.out).error?.code).toBe("PLUGIN_LOAD");

    await writeConfig(dir, "noname.json", rel(dir, "noname.mjs"));
    const noname = await runCli(["--config", "noname.json", "--json"], { cwd: dir });
    expect(parseJson(noname.out).error?.code).toBe("PLUGIN_SHAPE");

    await writeConfig(dir, "noreg.json", rel(dir, "noreg.mjs"));
    const noreg = await runCli(["--config", "noreg.json", "--json"], { cwd: dir });
    expect(parseJson(noreg.out).error?.code).toBe("PLUGIN_SHAPE");

    await writeConfig(dir, "dup.json", rel(dir, "dup.mjs"));
    const dup = await runCli(["--config", "dup.json", "--json"], { cwd: dir });
    expect(parseJson(dup.out).error?.code).toBe("PLUGIN_DUP");

    await writeConfig(dir, "boom.json", rel(dir, "boom.mjs"));
    const boom = await runCli(["--config", "boom.json", "boom"], { cwd: dir });
    expect(boom.code).toBe(1);
    expect(boom.err).toContain("boom");
    const boomJson = await runCli(["--config", "boom.json", "--json", "boom"], { cwd: dir });
    expect(parseJson(boomJson.out).error?.code).toBe("UNEXPECTED");
    expect(boomJson.err).toBe("");
  });
});
