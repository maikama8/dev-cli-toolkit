import { describe, expect, it } from "vitest";
import type { ExecFile } from "../src/exec.js";
import { defaultKill, firstLine, positiveInt, stripBom } from "../src/process.js";

describe("process helpers", () => {
  it("parses positive integers and strips a BOM", () => {
    expect(positiveInt("3", "count")).toBe(3);
    expect(() => positiveInt("0", "count")).toThrow(/positive integer/);
    expect(() => positiveInt("1.2", "count")).toThrow(/positive integer/);
    expect(stripBom("\uFEFFhi")).toBe("hi");
    expect(stripBom("")).toBe("");
    expect(firstLine("\n\n  hello \n world")).toBe("hello");
  });

  it("kills with taskkill on windows and wraps a unix failure", async () => {
    const calls: string[][] = [];
    const execFile: ExecFile = async (command, args) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: "", stderr: "" };
    };
    await defaultKill(42, "win32", execFile, {});
    expect(calls).toEqual([["taskkill", "/PID", "42", "/F"]]);

    const failed: ExecFile = async () => ({ code: 1, stdout: "", stderr: "Access is denied.\n" });
    await expect(defaultKill(42, "win32", failed, {})).rejects.toMatchObject({
      code: "KILL_FAILED",
      message: "Access is denied.",
    });

    const original = process.kill;
    process.kill = (() => {
      throw new Error("ESRCH");
    }) as typeof process.kill;
    try {
      await expect(defaultKill(42, "linux", execFile, {})).rejects.toMatchObject({
        code: "KILL_FAILED",
        message: "ESRCH",
      });
    } finally {
      process.kill = original;
    }
  });
});
