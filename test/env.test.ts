import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffEnv, formatEnv, parseEnv } from "../src/lib/env.js";
import { createPaint } from "../src/paint.js";
import { parseJson, runCli } from "./helpers.js";

const dirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parseEnv", () => {
  it("reads exports, quotes, comments, and inline comments", () => {
    const parsed = parseEnv(`
# comment
export HOST=localhost
PORT = "3000"
TOKEN='abc'
EMPTY=
NAME=Ada Lovelace # author
`);
    expect(parsed.order).toEqual(["HOST", "PORT", "TOKEN", "EMPTY", "NAME"]);
    expect(parsed.values.get("PORT")).toBe("3000");
    expect(parsed.values.get("TOKEN")).toBe("abc");
    expect(parsed.values.get("EMPTY")).toBe("");
    expect(parsed.values.get("NAME")).toBe("Ada Lovelace");
  });

  it("keeps equals signs inside a value and strips a BOM", () => {
    const parsed = parseEnv("\uFEFFDSN=postgres://localhost/db?x=1\r\n");
    expect(parsed.values.get("DSN")).toBe("postgres://localhost/db?x=1");
  });

  it("rejects a line that is not an assignment", () => {
    expect(() => parseEnv("NOT VALID\n")).toThrow(/line 1/);
    expect(() => parseEnv("1BAD=1\n")).toThrow(/invalid env name/);
  });
});

describe("diffEnv", () => {
  it("separates missing, empty, extra, and present keys in file order", () => {
    const diff = diffEnv(
      parseEnv("A=1\nB=\nC=only-env\n"),
      parseEnv("A=1\nB=required\nD=missing\n"),
      ".env",
      ".env.example",
    );
    expect(diff.ok).toEqual(["A"]);
    expect(diff.empty).toEqual(["B"]);
    expect(diff.missing).toEqual(["D"]);
    expect(diff.extra).toEqual(["C"]);
    expect(diff.problems).toBe(2);
    expect(formatEnv(diff, createPaint(false))).toContain("missing  D");
  });
});

describe("zt env check", () => {
  it("exits 0 when the files match and exits 1 when a key is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-env-"));
    dirs.push(dir);
    await writeFile(join(dir, ".env.example"), "PORT=3000\nTOKEN=\n");
    await writeFile(join(dir, ".env"), "PORT=3000\nTOKEN=secret\n");
    const ok = await runCli(["env", "check", "--json"], { cwd: dir });
    expect(ok.code).toBe(0);
    expect(parseJson(ok.out).ok).toBe(true);

    await writeFile(join(dir, ".env"), "PORT=3000\nTOKEN=\nDEBUG=1\n");
    const drifted = await runCli(["env", "check"], { cwd: dir });
    expect(drifted.code).toBe(1);
    expect(drifted.out).toContain("empty");
    expect(drifted.out).toContain("TOKEN");
    expect(drifted.out).toContain("extra");

    const strict = await runCli(["env", "check", "--strict", "--json"], { cwd: dir });
    expect(strict.code).toBe(1);
    const body = parseJson(strict.out);
    expect(body.error?.code).toBe("ENV_DRIFT");
    expect(body.data?.extra).toEqual(["DEBUG"]);
  });

  it("reports a missing env file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-env-"));
    dirs.push(dir);
    const result = await runCli(["env", "check", "--json"], { cwd: dir });
    expect(result.code).toBe(1);
    expect(parseJson(result.out).error?.code).toBe("ENV_MISSING");
  });
});
