import { describe, expect, it } from "vitest";
import { compareVersions, inspectTool, parseVersion } from "../src/lib/doctor.js";
import type { ExecFile } from "../src/exec.js";
import { parseJson, runCli } from "./helpers.js";

describe("doctor versions", () => {
  it("parses and compares versions", () => {
    expect(parseVersion("v22.11.0\n")).toBe("22.11.0");
    expect(parseVersion("git version 2.43.0")).toBe("2.43.0");
    expect(parseVersion("Docker version 27.0.3, build abc")).toBe("27.0.3");
    expect(parseVersion("missing")).toBeNull();
    expect(compareVersions("18.1.0", "18.0.9")).toBe(1);
    expect(compareVersions("2.30.0", "2.30.0")).toBe(0);
    expect(compareVersions("3.9.0", "3.11.2")).toBe(-1);
  });

  it("tries the next command when the first binary is missing", async () => {
    const execFile: ExecFile = async (command) => {
      if (command === "python3") return { code: 127, stdout: "", stderr: "not found" };
      if (command === "python") return { code: 0, stdout: "", stderr: "Python 3.12.3\n" };
      return { code: 127, stdout: "", stderr: "" };
    };
    const report = await inspectTool(
      { name: "python", commands: [["python3", "--version"], ["python", "--version"]] },
      "3.9.0",
      execFile,
      process.env,
    );
    expect(report).toMatchObject({ version: "3.12.3", status: "ok" });
  });

  it("marks an old tool outdated and a missing tool missing", async () => {
    const execFile: ExecFile = async (command) => {
      if (command === "node") return { code: 0, stdout: "v16.0.0\n", stderr: "" };
      if (command === "git") return { code: 0, stdout: "git version 2.40.1\n", stderr: "" };
      return { code: 127, stdout: "", stderr: "not found" };
    };
    const result = await runCli(["doctor", "--json"], { execFile });
    expect(result.code).toBe(0);
    const tools = parseJson(result.out).data?.tools as { name: string; status: string }[];
    expect(tools.find((tool) => tool.name === "node")?.status).toBe("outdated");
    expect(tools.find((tool) => tool.name === "git")?.status).toBe("ok");
    expect(tools.find((tool) => tool.name === "docker")?.status).toBe("missing");

    const strict = await runCli(["doctor", "--strict"], { execFile });
    expect(strict.code).toBe(1);
    expect(strict.out).toContain("outdated");
    expect(strict.out).toContain("missing");
  });

  it("reports the real node binary as ready", async () => {
    const result = await runCli(["doctor", "--json"]);
    expect(result.code).toBe(0);
    const tools = parseJson(result.out).data?.tools as { name: string; status: string; version: string }[];
    expect(tools.find((tool) => tool.name === "node")).toMatchObject({ status: "ok" });
  });
});
