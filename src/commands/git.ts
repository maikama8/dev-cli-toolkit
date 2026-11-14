import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import { commitRange, parseConventional, renderChangelog } from "../lib/changelog.js";
import { buildCommitMessage, promptCommit, type CommitAnswers } from "../lib/commit.js";
import {
  assertBranchName,
  assertRepo,
  assertRev,
  branchesToDelete,
  parseBranchList,
  readCommits,
  runGit,
} from "../lib/git.js";
import { createReadlinePrompter } from "../lib/prompt.js";
import { ZtError } from "../errors.js";
import { firstLine } from "../process.js";
import type { CliContext, CommandPlugin } from "../types.js";
import { sharedOptions } from "./shared.js";
import type { Paint } from "../paint.js";

export const gitPlugin: CommandPlugin = {
  name: "git",
  description: "Conventional commits, merged-branch cleanup, and changelogs",
  register(program: Command, ctx: CliContext) {
    const git = program
      .command("git")
      .description("Conventional commits, merged-branch cleanup, and changelogs");

    const commit = git
      .command("commit")
      .description("Create a conventional commit from flags or a prompt")
      .option("-t, --type <type>", "feat, fix, docs, style, refactor, perf, test, build, ci, chore, or revert")
      .option("-s, --scope <scope>", "optional scope")
      .option("-m, --subject <subject>", "subject line")
      .option("--body <text>", "commit body")
      .option("--breaking <note>", "breaking change note")
      .option("-a, --all", "stage tracked modifications, like git commit -a")
      .option("--dry-run", "print the message and do not run git commit")
      .addHelpText(
        "after",
        `
Examples:
  $ zt git commit
  $ zt git commit --type feat --scope api --subject "add health route"
  $ zt git commit --type feat --subject "change the payload" --breaking "drop the v1 field" --dry-run

Stage files first. --all is the same as git commit -a. In a terminal, omitted type and subject are prompted.
`,
      );
    sharedOptions(commit).action(async (opts: CommitFlags) => {
      const answers = await resolveAnswers(ctx, opts);
      const message = buildCommitMessage(answers);
      if (opts.dryRun) {
        ctx.output.ok({ message, dryRun: true }, message);
        return;
      }
      await assertRepo(ctx);
      const args = ["commit"];
      if (opts.all) args.push("-a");
      args.push("-m", message);
      const result = await runGit(ctx, args);
      if (result.code !== 0) {
        throw new ZtError(
          firstLine(result.stderr) || firstLine(result.stdout) || "git commit failed",
          "GIT_COMMIT",
        );
      }
      const head = await runGit(ctx, ["rev-parse", "--short", "HEAD"]);
      const hash = head.stdout.trim();
      ctx.output.ok({ message, hash, dryRun: false }, `committed ${hash}\n\n${message}`);
    });

    const cleanup = git
      .command("cleanup")
      .description("Delete local branches already merged into the base branch")
      .option("--base <branch>", "base branch", ctx.config.git.baseBranch)
      .option("--dry-run", "list branches that would be deleted")
      .option("-y, --yes", "delete without a confirmation prompt")
      .addHelpText(
        "after",
        `
Examples:
  $ zt git cleanup --dry-run
  $ zt git cleanup --yes
  $ zt git cleanup --base develop --yes

Only local branches are deleted, and only with git branch -d. main, master, develop, the current branch, and config.git.protectedBranches are kept. Remote branches are left alone.
`,
      );
    sharedOptions(cleanup).action(async (opts: { base?: string; dryRun?: boolean; yes?: boolean }) => {
      await assertRepo(ctx);
      const base = opts.base ?? ctx.config.git.baseBranch;
      assertRev(base);
      const verify = await runGit(ctx, ["rev-parse", "--verify", "--quiet", base]);
      if (verify.code !== 0) {
        ctx.output.fail("GIT_BASE", `unknown base branch "${base}"`);
      }
      const listed = await runGit(ctx, ["branch", "--merged", base]);
      if (listed.code !== 0) {
        throw new ZtError(firstLine(listed.stderr) || "git branch failed", "GIT_BRANCH");
      }
      const names = branchesToDelete(parseBranchList(listed.stdout), ctx.config.git.protectedBranches);
      for (const name of names) assertBranchName(name);
      const preview = formatCleanup(names, true, ctx.output.paint);
      if (names.length === 0 || opts.dryRun) {
        ctx.output.ok({ base, branches: names, dryRun: Boolean(opts.dryRun), deleted: [] }, preview);
        return;
      }
      if (!opts.yes) {
        if (!ctx.isTTY) {
          ctx.output.fail(
            "CLEANUP_CONFIRM",
            "pass --yes to delete merged branches, or --dry-run to preview",
            { base, branches: names },
            preview,
          );
        }
        const allowed = await confirm(ctx, `delete ${names.length} merged branches?`, "n");
        if (!allowed) {
          ctx.output.ok({ base, branches: names, dryRun: false, deleted: [] }, "left branches in place");
          return;
        }
      }
      const deleted: string[] = [];
      for (const name of names) {
        const removed = await runGit(ctx, ["branch", "-d", name]);
        if (removed.code !== 0) {
          ctx.output.fail(
            "GIT_BRANCH",
            firstLine(removed.stderr) || `could not delete ${name}`,
            { base, deleted, failed: name },
          );
        }
        deleted.push(name);
      }
      ctx.output.ok(
        { base, branches: names, dryRun: false, deleted },
        formatCleanup(deleted, false, ctx.output.paint),
      );
    });

    const changelog = git
      .command("changelog")
      .description("Build a markdown changelog from conventional commits")
      .option("--from <rev>", "exclusive start revision")
      .option("--to <rev>", "end revision (default HEAD)")
      .option("--out <file>", "write the changelog to this file instead of stdout")
      .option("-f, --force", "overwrite --out when it already exists")
      .addHelpText(
        "after",
        `
Examples:
  $ zt git changelog
  $ zt git changelog --from v0.1.0
  $ zt git changelog --out CHANGELOG.md --force

The default prints markdown so it can be redirected. --json wraps that markdown in a document.
`,
      );
    sharedOptions(changelog).action(
      async (opts: { from?: string; to?: string; out?: string; force?: boolean }) => {
        if (opts.from) assertRev(opts.from);
        if (opts.to) assertRev(opts.to);
        const commits = (await readCommits(ctx, commitRange(opts.from, opts.to))).map(parseConventional);
        const markdown = renderChangelog(commits);
        if (!opts.out) {
          ctx.output.ok({ markdown, commits: commits.length }, markdown);
          return;
        }
        const target = resolve(ctx.cwd, opts.out);
        if (!opts.force) {
          try {
            await access(target);
            ctx.output.fail("EXISTS", `refusing to overwrite ${opts.out} (pass --force)`, {
              path: opts.out,
            });
          } catch (err) {
            const error = err as NodeJS.ErrnoException;
            if (error.code !== "ENOENT") throw err;
          }
        }
        await writeFile(target, markdown, "utf8");
        ctx.output.ok({ path: opts.out, markdown, commits: commits.length }, `wrote ${opts.out}`);
      },
    );
  },
};

interface CommitFlags {
  type?: string;
  scope?: string;
  subject?: string;
  body?: string;
  breaking?: string;
  all?: boolean;
  dryRun?: boolean;
}

async function resolveAnswers(ctx: CliContext, opts: CommitFlags): Promise<CommitAnswers> {
  const partial: Partial<CommitAnswers> = {
    type: opts.type,
    scope: opts.scope,
    subject: opts.subject,
    body: opts.body,
    breaking: opts.breaking,
  };
  if ((!opts.type || !opts.subject) && ctx.isTTY) {
    const prompter = ctx.prompter ?? createReadlinePrompter();
    try {
      return await promptCommit(prompter, partial);
    } finally {
      prompter.close?.();
    }
  }
  return {
    type: opts.type ?? "",
    scope: opts.scope ?? "",
    subject: opts.subject ?? "",
    body: opts.body ?? "",
    breaking: opts.breaking ?? "",
  };
}

async function confirm(ctx: CliContext, question: string, fallback: string): Promise<boolean> {
  const prompter = ctx.prompter ?? createReadlinePrompter();
  try {
    const answer = await prompter.ask(question, fallback);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompter.close?.();
  }
}

function formatCleanup(names: string[], dryRun: boolean, paint: Paint): string {
  if (names.length === 0) return "no merged branches to delete";
  const verb = dryRun ? "would delete" : paint.green("deleted");
  const lines = [
    `${verb} ${names.length} merged branch${names.length === 1 ? "" : "es"}`,
  ];
  for (const name of names) lines.push(`  ${name}`);
  return lines.join("\n");
}
