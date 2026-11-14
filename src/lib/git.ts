import type { ExecResult } from "../exec.js";
import { ZtError } from "../errors.js";
import { firstLine } from "../process.js";
import type { CliContext } from "../types.js";
import { parseGitLog, type LogCommit } from "./changelog.js";

/** A local branch from `git branch`. */
export interface BranchRef {
  name: string;
  current: boolean;
}

/** Run git in the context working directory. */
export async function runGit(ctx: CliContext, args: string[]): Promise<ExecResult> {
  return ctx.execFile("git", args, { cwd: ctx.cwd, env: ctx.env });
}

/** Reject revisions that look like flags or contain unexpected characters. */
export function assertRev(rev: string): void {
  if (!rev || rev.startsWith("-") || !/^[A-Za-z0-9._/^~-]+$/.test(rev)) {
    throw new ZtError(`invalid revision "${rev}"`, "GIT_REV");
  }
}

/** Throw `NOT_A_REPO` when `cwd` is not inside a work tree. */
export async function assertRepo(ctx: CliContext): Promise<void> {
  const result = await runGit(ctx, ["rev-parse", "--is-inside-work-tree"]);
  if (result.code !== 0 || result.stdout.trim() !== "true") {
    throw new ZtError("not a git repository", "NOT_A_REPO");
  }
}

/** Parse `git branch` output. A detached HEAD line is skipped. */
export function parseBranchList(stdout: string): BranchRef[] {
  const branches: BranchRef[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const current = line.startsWith("*");
    const name = line.replace(/^[*+]\s*/, "").trim();
    if (!name || name.startsWith("(")) continue;
    branches.push({ name, current });
  }
  return branches;
}

/** Drop the current branch and any protected name. */
export function branchesToDelete(branches: BranchRef[], protectedBranches: string[]): string[] {
  const protect = new Set(protectedBranches);
  return branches
    .filter((branch) => !branch.current && !protect.has(branch.name))
    .map((branch) => branch.name);
}

/** Reject branch names that `git branch -d` could misread. */
export function assertBranchName(name: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.startsWith("-") || name.includes("..")) {
    throw new ZtError(`refusing to delete branch "${name}"`, "GIT_BRANCH");
  }
}

/** Read commits in `range`, or the whole history when `range` is omitted. */
export async function readCommits(ctx: CliContext, range?: string): Promise<LogCommit[]> {
  await assertRepo(ctx);
  const args = ["log", "--pretty=format:%h%x1f%s%x1f%b%x1e"];
  if (range) args.push(range);
  const result = await runGit(ctx, args);
  if (result.code !== 0) {
    const message = result.stderr.toLowerCase();
    if (message.includes("does not have any commits")) return [];
    throw new ZtError(firstLine(result.stderr) || "git log failed", "GIT_LOG");
  }
  return parseGitLog(result.stdout);
}
