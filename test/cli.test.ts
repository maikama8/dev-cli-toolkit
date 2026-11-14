import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig, peekConfigPath } from "../src/config.js";
import { CommandRegistry } from "../src/registry.js";
import { resolveColor } from "../src/paint.js";
import { version } from "../src/version.js";
import { parseJson, runCli } from "./helpers.js";

const dirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config and color", () => {
  it("parses a config file and finds --config in argv", () => {
    const config = parseConfig(
      JSON.stringify({
        color: false,
        plugins: ["./plugin.mjs"],
        git: { baseBranch: "develop", protectedBranches: ["develop"] },
        http: { timeoutMs: 2500 },
        doctor: { minVersions: { node: "20.0.0" } },
        theme: "ignored",
      }),
    );
    expect(config.color).toBe(false);
    expect(config.git.baseBranch).toBe("develop");
    expect(config.http.timeoutMs).toBe(2500);
    expect(config.doctor.minVersions.node).toBe("20.0.0");
    expect(peekConfigPath(["env", "check", "--config", "zt.json"], {})).toBe("zt.json");
    expect(peekConfigPath(["--config=./a.json", "doctor"], {})).toBe("./a.json");
    expect(() => parseConfig("{")).toThrow(/invalid JSON/);
    expect(() => parseConfig('{"plugins":[1]}')).toThrow(/plugins/);
  });

  it("turns color off for JSON, NO_COLOR, and a false config", () => {
    expect(
      resolveColor({ json: true, noColorEnv: false, isTTY: true, colorFlag: true }),
    ).toBe(false);
    expect(resolveColor({ json: false, noColorEnv: true, isTTY: true, colorFlag: true })).toBe(true);
    expect(resolveColor({ json: false, noColorEnv: true, isTTY: true })).toBe(false);
    expect(
      resolveColor({ json: false, noColorEnv: false, isTTY: true, configColor: false }),
    ).toBe(false);
    expect(resolveColor({ json: false, noColorEnv: false, isTTY: false, colorFlag: true })).toBe(true);
  });

  it("rejects a duplicate plugin name", () => {
    const registry = new CommandRegistry();
    const plugin = {
      name: "hello",
      description: "hello",
      register() {
        return undefined;
      },
    };
    registry.add(plugin);
    expect(() => registry.add(plugin)).toThrow(/already registered/);
    expect(registry.list().map((item) => item.name)).toEqual(["hello"]);
  });
});

describe("zt", () => {
  it("prints help, version, and an unknown-command error", async () => {
    const help = await runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("init");
    expect(help.out).toContain("doctor");
    expect(help.out).toContain("Examples:");
    const gitHelp = await runCli(["git", "--help"]);
    expect(gitHelp.out).toContain("commit");
    expect(gitHelp.out).toContain("cleanup");
    expect(gitHelp.out).toContain("changelog");
    const versionResult = await runCli(["--version"]);
    expect(versionResult.out.trim()).toBe(version);
    const unknown = await runCli(["nope"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err.toLowerCase()).toContain("unknown");
  });

  it("loads a plugin from the config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-plugin-"));
    dirs.push(dir);
    const pluginPath = fileURLToPath(new URL("../examples/plugin.mjs", import.meta.url));
    await writeFile(
      join(dir, ".ztrc"),
      JSON.stringify({ plugins: [pluginPath] }),
    );
    const result = await runCli(["hello", "Ada", "--json"], { homeDir: dir, cwd: dir });
    expect(result.code).toBe(0);
    expect(parseJson(result.out).data?.greeting).toBe("Hello, Ada");
    const dup = await runCli(["--help"], {
      homeDir: dir,
      cwd: dir,
      env: { ...process.env, ZT_CONFIG: join(dir, "missing.json") },
    });
    expect(dup.code).toBe(1);
    expect(dup.out).toContain("config not found");
  });

  it("colors human output when asked and stays plain for --json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-color-"));
    dirs.push(dir);
    await writeFile(join(dir, ".env.example"), "A=1\n");
    await writeFile(join(dir, ".env"), "A=1\n");
    const colored = await runCli(["--color", "env", "check"], { cwd: dir, isTTY: false });
    expect(colored.out).toContain("\u001b[");
    const plain = await runCli(["env", "check", "--json"], { cwd: dir, isTTY: true });
    expect(plain.out).not.toContain("\u001b[");
  });
});
