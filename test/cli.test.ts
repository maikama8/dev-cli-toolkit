import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, peekConfigPath } from "../src/config.js";
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
    expect(() => parseConfig("[]")).toThrow(/JSON object/);
    expect(() => parseConfig('{"color":"yes"}')).toThrow(/color/);
    expect(() => parseConfig('{"git":[]}')).toThrow(/config.git/);
    expect(() => parseConfig('{"git":{"baseBranch":""}}')).toThrow(/baseBranch/);
    expect(() => parseConfig('{"git":{"protectedBranches":[1]}}')).toThrow(/protectedBranches/);
    expect(() => parseConfig('{"http":{"timeoutMs":0}}')).toThrow(/timeoutMs/);
    expect(() => parseConfig('{"doctor":{"minVersions":{"node":"18"}}}')).toThrow(/1\.2\.3/);
    expect(parseConfig('{"doctor":{"minVersions":{"node":"20.0.0"}}}').doctor.minVersions).toEqual({
      node: "20.0.0",
    });
    expect(() => peekConfigPath(["--config"], {})).toThrow(/missing path/);
    expect(() => peekConfigPath(["--config="], {})).toThrow(/missing path/);
    expect(peekConfigPath(["--", "--config", "x"], { ZT_CONFIG: "from-env.json" })).toBe("from-env.json");
    expect(peekConfigPath(["doctor"], {})).toBeUndefined();
  });

  it("returns defaults when ~/.ztrc is missing and errors on a bad explicit path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-config-"));
    dirs.push(dir);
    const missing = await loadConfig({ homeDir: dir, cwd: dir });
    expect(missing.path).toBeUndefined();
    expect(missing.config.git.baseBranch).toBe("main");
    await expect(loadConfig({ explicit: "missing.json", homeDir: dir, cwd: dir })).rejects.toThrow(
      /not found/,
    );
    await writeFile(join(dir, ".ztrc"), "{");
    await expect(loadConfig({ homeDir: dir, cwd: dir })).rejects.toThrow(/invalid JSON/);
    await expect(loadConfig({ explicit: dir, homeDir: dir, cwd: dir })).rejects.toThrow(
      /could not read config/,
    );
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
    expect(
      resolveColor({
        json: false,
        noColorFlag: true,
        colorFlag: true,
        noColorEnv: false,
        isTTY: true,
      }),
    ).toBe(false);
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

    await writeFile(join(dir, "ztrc.json"), JSON.stringify({ color: true }));
    const env = { ...process.env };
    delete env.NO_COLOR;
    const fromConfig = await runCli(["--config", "ztrc.json", "env", "check"], {
      cwd: dir,
      isTTY: false,
      env,
    });
    expect(fromConfig.out).toContain("\u001b[");
    const forcedOff = await runCli(["--config", "ztrc.json", "--no-color", "env", "check"], {
      cwd: dir,
      isTTY: true,
      env,
    });
    expect(forcedOff.out).not.toContain("\u001b[");
  });

  it("prints a stack when ZT_DEBUG is set and stays quiet in JSON mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-debug-"));
    dirs.push(dir);
    const env = { ...process.env, ZT_DEBUG: "1" };
    const human = await runCli(["env", "check"], { cwd: dir, env });
    expect(human.code).toBe(1);
    expect(human.err).toContain("ZtError");
    const json = await runCli(["env", "check", "--json"], { cwd: dir, env });
    expect(json.err).not.toContain("ZtError");
    expect(parseJson(json.out).error?.code).toBe("ENV_MISSING");
  });
});
