import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJson, runCli } from "./helpers.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "zt-plugin-"));
  dirs.push(dir);
  return dir;
}

describe("plugins", () => {
  it("loads a plugin from a path relative to the config file", async () => {
    const dir = await temp();
    await writeFile(
      join(dir, "ping.mjs"),
      `export const name = "ping";
export const description = "ping";
export function register(program, ctx) {
  program.command("ping").action(() => ctx.output.ok({ pong: true }, "pong"));
}
`,
    );
    await writeFile(join(dir, ".ztrc"), JSON.stringify({ plugins: ["./ping.mjs"] }));
    const result = await runCli(["ping", "--json"], { homeDir: dir, cwd: dir });
    expect(result.code).toBe(0);
    expect(parseJson(result.out).data?.pong).toBe(true);
  });

  it("reports a missing file, a bad shape, a duplicate name, and an unexpected throw", async () => {
    const dir = await temp();

    await writeFile(join(dir, "missing.json"), JSON.stringify({ plugins: ["./nope.mjs"] }));
    const missing = await runCli(["--config", "missing.json", "--json"], { cwd: dir });
    expect(parseJson(missing.out).error?.code).toBe("PLUGIN_LOAD");

    await writeFile(join(dir, "bad.mjs"), "export default {\n");
    await writeFile(join(dir, "bad.json"), JSON.stringify({ plugins: ["./bad.mjs"] }));
    const bad = await runCli(["--config", "bad.json", "--json"], { cwd: dir });
    expect(parseJson(bad.out).error?.code).toBe("PLUGIN_LOAD");

    await writeFile(join(dir, "noname.mjs"), "export default { register() {} };\n");
    await writeFile(join(dir, "noname.json"), JSON.stringify({ plugins: ["./noname.mjs"] }));
    const noname = await runCli(["--config", "noname.json", "--json"], { cwd: dir });
    expect(parseJson(noname.out).error?.code).toBe("PLUGIN_SHAPE");

    await writeFile(join(dir, "noreg.mjs"), "export default { name: 'x' };\n");
    await writeFile(join(dir, "noreg.json"), JSON.stringify({ plugins: ["./noreg.mjs"] }));
    const noreg = await runCli(["--config", "noreg.json", "--json"], { cwd: dir });
    expect(parseJson(noreg.out).error?.code).toBe("PLUGIN_SHAPE");

    await writeFile(join(dir, "dup.mjs"), "export default { name: 'doctor', register() {} };\n");
    await writeFile(join(dir, "dup.json"), JSON.stringify({ plugins: ["./dup.mjs"] }));
    const dup = await runCli(["--config", "dup.json", "--json"], { cwd: dir });
    expect(parseJson(dup.out).error?.code).toBe("PLUGIN_DUP");

    await writeFile(
      join(dir, "boom.mjs"),
      `export default {
  name: "boom",
  description: "boom",
  register(program) {
    program.command("boom").action(() => {
      throw new Error("boom");
    });
  },
};
`,
    );
    await writeFile(join(dir, "boom.json"), JSON.stringify({ plugins: ["./boom.mjs"] }));
    const boom = await runCli(["--config", "boom.json", "boom"], { cwd: dir });
    expect(boom.code).toBe(1);
    expect(boom.err).toContain("boom");
    const boomJson = await runCli(["--config", "boom.json", "--json", "boom"], { cwd: dir });
    expect(parseJson(boomJson.out).error?.code).toBe("UNEXPECTED");
    expect(boomJson.err).toBe("");
  });
});
