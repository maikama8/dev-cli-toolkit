import type { ExecFile } from "../exec.js";
import type { Paint } from "../paint.js";

/** A tool doctor can check, and the commands it tries in order. */
export interface ToolSpec {
  name: string;
  commands: string[][];
}

/** One doctor row. `outdated` means the version is below the configured minimum. */
export interface ToolReport {
  name: string;
  version: string | null;
  status: "ok" | "outdated" | "missing";
  min?: string;
}

/** node, npm, git, python, and docker. Python tries `python3`, then `python`. */
export const defaultTools: ToolSpec[] = [
  { name: "node", commands: [["node", "--version"]] },
  { name: "npm", commands: [["npm", "--version"]] },
  { name: "git", commands: [["git", "--version"]] },
  { name: "python", commands: [["python3", "--version"], ["python", "--version"]] },
  { name: "docker", commands: [["docker", "--version"]] },
];

/** Pull the first `major.minor.patch` out of a version command. */
export function parseVersion(text: string): string | null {
  const match = text.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/** Compare `major.minor.patch` strings. Returns -1, 0, or 1. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part));
  const b = right.split(".").map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** Run a tool's commands until one prints a version. A missing binary is code 127. */
export async function inspectTool(
  spec: ToolSpec,
  min: string | undefined,
  execFile: ExecFile,
  env: NodeJS.ProcessEnv,
): Promise<ToolReport> {
  for (const command of spec.commands) {
    const [bin, ...args] = command;
    if (!bin) continue;
    const result = await execFile(bin, args, { env });
    if (result.code === 127) continue;
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (!version) continue;
    const outdated = min ? compareVersions(version, min) < 0 : false;
    return { name: spec.name, version, status: outdated ? "outdated" : "ok", min };
  }
  return { name: spec.name, version: null, status: "missing", min };
}

/** Inspect each tool. Minimums come from config, keyed by tool name. */
export async function inspectTools(
  specs: ToolSpec[],
  mins: Record<string, string>,
  execFile: ExecFile,
  env: NodeJS.ProcessEnv,
): Promise<ToolReport[]> {
  const reports: ToolReport[] = [];
  for (const spec of specs) {
    reports.push(await inspectTool(spec, mins[spec.name], execFile, env));
  }
  return reports;
}

/** Format doctor rows for a terminal, plus a ready count. */
export function formatDoctor(reports: ToolReport[], paint: Paint): string {
  const nameWidth = Math.max(4, ...reports.map((report) => report.name.length));
  const versionWidth = Math.max(7, ...reports.map((report) => (report.version ?? "-").length));
  const lines = reports.map((report) => {
    const version = (report.version ?? "-").padEnd(versionWidth);
    const status =
      report.status === "ok"
        ? paint.green("ok")
        : report.status === "outdated"
          ? paint.yellow("outdated")
          : paint.red("missing");
    const min = report.status === "outdated" && report.min ? paint.dim(`  min ${report.min}`) : "";
    return `${report.name.padEnd(nameWidth)}  ${version}  ${status}${min}`;
  });
  const ready = reports.filter((report) => report.status === "ok").length;
  lines.push("", `${ready} of ${reports.length} tools ready`);
  return lines.join("\n");
}
