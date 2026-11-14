import { ZtError } from "../errors.js";
import type { Paint } from "../paint.js";
import type { CliContext } from "../types.js";

export interface PortOwner {
  command: string;
  pid: number;
  user?: string;
  address: string;
}

export function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ZtError("port must be an integer from 1 to 65535", "BAD_PORT");
  }
}

export function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw new ZtError(`invalid port "${value}"`, "BAD_PORT");
  const port = Number(value);
  validatePort(port);
  return port;
}

function hasPort(text: string, port: number): boolean {
  return new RegExp(`:${port}(?!\\d)`).test(text);
}

export function parseLsof(stdout: string, port: number): PortOwner[] {
  const owners: PortOwner[] = [];
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = Number(parts[1]);
    const name = parts.slice(8).join(" ");
    if (!Number.isInteger(pid) || !hasPort(name, port)) continue;
    owners.push({
      command: parts[0] ?? "unknown",
      pid,
      user: parts[2],
      address: name.replace(/\s+\(LISTEN\)$/, ""),
    });
  }
  return dedupe(owners);
}

export function parseSs(stdout: string, port: number): PortOwner[] {
  const owners: PortOwner[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!hasPort(line, port)) continue;
    const local = line.match(new RegExp(`(\\S*:${port})(?!\\d)`));
    const pidMatch = line.match(/pid=(\d+)/);
    const commandMatch = line.match(/\("([^"]+)"/);
    if (!local || !pidMatch) continue;
    owners.push({
      command: commandMatch?.[1] ?? "unknown",
      pid: Number(pidMatch[1]),
      address: local[1] ?? "",
    });
  }
  return dedupe(owners);
}

export function parseNetstat(stdout: string, port: number): PortOwner[] {
  const owners: PortOwner[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== "TCP" || parts.length < 5) continue;
    if ((parts[3] ?? "").toUpperCase() !== "LISTENING") continue;
    const local = parts[1] ?? "";
    const pid = Number(parts[4]);
    if (!hasPort(local, port) || !Number.isInteger(pid)) continue;
    owners.push({ command: "pid", pid, address: local });
  }
  return dedupe(owners);
}

export async function findListeners(
  ctx: Pick<CliContext, "execFile" | "platform" | "env">,
  port: number,
): Promise<PortOwner[]> {
  validatePort(port);
  if (ctx.platform === "win32") {
    const result = await ctx.execFile("netstat", ["-ano", "-p", "tcp"], { env: ctx.env });
    if (result.code !== 0) {
      throw new ZtError(result.stderr.trim() || "netstat failed", "PORT_LOOKUP");
    }
    return parseNetstat(result.stdout, port);
  }

  if (ctx.platform === "linux") {
    const ss = await ctx.execFile("ss", ["-ltnp"], { env: ctx.env });
    if (ss.code === 0) {
      const owners = parseSs(ss.stdout, port);
      if (owners.length > 0 || !hasPort(ss.stdout, port)) return owners;
    } else if (ss.code !== 127 && ss.code !== 0) {
      // ss ran and failed for a reason other than "not installed". Try lsof next.
    }
    return readLsof(ctx, port);
  }

  return readLsof(ctx, port);
}

async function readLsof(
  ctx: Pick<CliContext, "execFile" | "env">,
  port: number,
): Promise<PortOwner[]> {
  const result = await ctx.execFile("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { env: ctx.env });
  if (result.code === 127) {
    throw new ZtError("could not inspect ports (lsof is not installed)", "PORT_LOOKUP");
  }
  if (result.code !== 0 && result.code !== 1) {
    throw new ZtError(result.stderr.trim() || "lsof failed", "PORT_LOOKUP");
  }
  return parseLsof(result.stdout, port);
}

export function assertKillable(pid: number, selfPid: number): void {
  if (!Number.isInteger(pid) || pid <= 1) {
    throw new ZtError(`refusing to kill pid ${pid}`, "KILL_REFUSED");
  }
  if (pid === selfPid) {
    throw new ZtError("refusing to kill the current process", "KILL_REFUSED");
  }
}

export function formatListeners(port: number, owners: PortOwner[], paint: Paint): string {
  if (owners.length === 0) return `nothing is listening on ${port}`;
  const lines = [`port ${port}`];
  for (const owner of owners) {
    const user = owner.user ? `  ${owner.user}` : "";
    lines.push(`  ${paint.cyan(owner.command)}  pid ${owner.pid}${user}  ${paint.dim(owner.address)}`);
  }
  return lines.join("\n");
}

export function formatKill(port: number, pids: number[], dryRun: boolean): string {
  if (pids.length === 0) return `nothing to kill on ${port}`;
  const verb = dryRun ? "would kill" : "killed";
  return pids.map((pid) => `${verb} pid ${pid} on port ${port}`).join("\n");
}

function dedupe(owners: PortOwner[]): PortOwner[] {
  const seen = new Set<number>();
  const unique: PortOwner[] = [];
  for (const owner of owners) {
    if (seen.has(owner.pid)) continue;
    seen.add(owner.pid);
    unique.push(owner);
  }
  return unique;
}
