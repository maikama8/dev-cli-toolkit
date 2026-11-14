import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeBase64, encodeBase64 } from "../src/lib/base64.js";
import { decodeJwt } from "../src/lib/jwt.js";
import { getPath, parseJson } from "../src/lib/json-doc.js";
import { checkUuid, generateUuid } from "../src/lib/uuid.js";
import { parseJson as parseOut, runCli } from "./helpers.js";

const dirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function segment(value: unknown): string {
  return encodeBase64(JSON.stringify(value), true);
}

describe("json", () => {
  it("formats, minifies, and reads a path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-json-"));
    dirs.push(dir);
    await writeFile(join(dir, "doc.json"), '{"user":{"name":"Ada"},"items":[{"id":7}]}\n');
    const pretty = await runCli(["json", "format", "doc.json"], { cwd: dir });
    expect(pretty.code).toBe(0);
    expect(pretty.out).toContain('"name": "Ada"');
    const mini = await runCli(["json", "minify", "doc.json"], { cwd: dir });
    expect(mini.out.trim()).toBe('{"user":{"name":"Ada"},"items":[{"id":7}]}');
    const picked = await runCli(["json", "get", "items.0.id", "doc.json", "--json"], { cwd: dir });
    expect(parseOut(picked.out).data?.value).toBe(7);
    const missing = await runCli(["json", "get", "user.email", "doc.json", "--json"], { cwd: dir });
    expect(missing.code).toBe(1);
    expect(parseOut(missing.out).error?.code).toBe("PATH_NOT_FOUND");
    const fromStdin = await runCli(["json", "format", "--json"], { stdin: '{"a":1}' });
    expect(parseOut(fromStdin.out).data?.value).toEqual({ a: 1 });
  });

  it("rejects invalid documents and a missing path segment", () => {
    expect(() => parseJson("{")).toThrow(/invalid JSON/);
    expect(() => getPath({ items: [] }, "items.0")).toThrow(/path not found/);
  });

  it("reports a missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-json-"));
    dirs.push(dir);
    const missing = await runCli(["json", "format", "missing.json", "--json"], { cwd: dir });
    expect(missing.code).toBe(1);
    expect(parseOut(missing.out).error?.code).toBe("NOT_FOUND");
  });
});

describe("base64", () => {
  it("round-trips utf8 and the url alphabet", async () => {
    expect(encodeBase64("hi ✨")).toBe(Buffer.from("hi ✨").toString("base64"));
    expect(decodeBase64(encodeBase64("hi ✨"))).toBe("hi ✨");
    const url = encodeBase64("???", true);
    expect(encodeBase64("???")).not.toBe(url);
    expect(url).not.toMatch(/[+/=]/);
    expect(decodeBase64(url, true)).toBe("???");
    const encoded = await runCli(["base64", "encode", "hello"]);
    expect(encoded.out.trim()).toBe("aGVsbG8=");
    const decoded = await runCli(["base64", "decode", "--url", "aGVsbG8"]);
    expect(decoded.out.trim()).toBe("hello");
    const bad = await runCli(["base64", "decode", "!!!!", "--json"]);
    expect(bad.code).toBe(1);
    expect(parseOut(bad.out).error?.code).toBe("BASE64_INVALID");
    expect(decodeBase64("")).toBe("");
    const fromStdin = await runCli(["base64", "encode"], { stdin: "hello" });
    expect(fromStdin.out.trim()).toBe("aGVsbG8=");
    const empty = await runCli(["base64", "decode", "--json"], { stdin: "" });
    expect(parseOut(empty.out).error?.code).toBe("NO_INPUT");
  });
});

describe("jwt", () => {
  const now = new Date("2024-01-02T00:00:00Z");

  it("decodes a payload without checking the signature", () => {
    const token = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({
      sub: "user-1",
      exp: 1700000000,
    })}.not-a-real-signature`;
    const report = decodeJwt(token, now);
    expect(report.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(report.payload.sub).toBe("user-1");
    expect(report.signaturePresent).toBe(true);
    expect(report.expired).toBe(true);
    expect(report.expiresAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("flags a token that is not valid yet and rejects a bad shape", () => {
    const future = decodeJwt(
      `${segment({ alg: "none" })}.${segment({ nbf: 2_000_000_000 })}.`,
      now,
    );
    expect(future.notYetValid).toBe(true);
    expect(future.signaturePresent).toBe(false);
    expect(() => decodeJwt("only.two", now)).toThrow(/three dot-separated/);
    expect(() => decodeJwt(`${segment("nope")}.${segment({})}.x`, now)).toThrow(/header/);
    expect(() => decodeJwt(`${segment({ alg: "none" })}.${segment({ exp: "soon" })}.x`, now)).toThrow(
      /claim exp/,
    );
  });

  it("prints the decoded token from the command", async () => {
    const token = `${segment({ alg: "none", typ: "JWT" })}.${segment({ sub: "ada" })}.sig`;
    const result = await runCli(["jwt", "decode", token]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("sub  ada");
    expect(result.out).toContain("signature not verified");
  });
});

describe("uuid", () => {
  it("generates v4 values and validates the nil uuid", async () => {
    const one = generateUuid();
    expect(checkUuid(one)).toMatchObject({ valid: true, version: 4, nil: false });
    expect(checkUuid("00000000-0000-0000-0000-000000000000")).toMatchObject({
      valid: true,
      nil: true,
    });
    expect(checkUuid("not-a-uuid").valid).toBe(false);

    const generated = await runCli(["uuid", "generate", "--count", "3"]);
    expect(generated.code).toBe(0);
    expect(generated.out.trim().split("\n")).toHaveLength(3);

    const single = await runCli(["uuid"]);
    expect(single.code).toBe(0);
    expect(checkUuid(single.out.trim()).valid).toBe(true);

    const invalid = await runCli(["uuid", "validate", "nope", "--json"]);
    expect(invalid.code).toBe(1);
    expect(parseOut(invalid.out).error?.code).toBe("UUID_INVALID");

    const nil = await runCli(["uuid", "validate", "00000000-0000-0000-0000-000000000000"]);
    expect(nil.code).toBe(0);
    expect(nil.out).toContain("valid nil uuid");

    const zero = await runCli(["uuid", "--count", "0", "--json"]);
    expect(parseOut(zero.out).error?.code).toBe("BAD_NUMBER");
    const many = await runCli(["uuid", "generate", "--count", "101", "--json"]);
    expect(parseOut(many.out).error?.code).toBe("UUID_COUNT");
  });
});
