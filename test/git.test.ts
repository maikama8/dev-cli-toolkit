import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { branchesToDelete, parseBranchList } from "../src/lib/git.js";
import { git, initRepo, parseJson, runCli } from "./helpers.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("branch selection", () => {
  it("keeps the current branch and protected names", () => {
    const branches = parseBranchList("  feature/login\n* main\n  old-fix\n  (HEAD detached at abc)\n");
    expect(branchesToDelete(branches, ["main", "master", "develop"])).toEqual([
      "feature/login",
      "old-fix",
    ]);
  });
});

describe("zt git", () => {
  it("commits, writes a changelog, and deletes only merged branches", async () => {
    const { dir, env } = await initRepo();
    dirs.push(dir);
    await writeFile(join(dir, "a.txt"), "a\n");
    await git(dir, env, ["add", "a.txt"]);
    const committed = await runCli(
      ["git", "commit", "--type", "chore", "--subject", "initial", "--all"],
      { cwd: dir, env },
    );
    expect(committed.code).toBe(0);
    expect(committed.out).toContain("chore: initial");
    const subject = await git(dir, env, ["log", "-1", "--format=%s"]);
    expect(subject.trim()).toBe("chore: initial");

    await writeFile(join(dir, "b.txt"), "b\n");
    await git(dir, env, ["add", "b.txt"]);
    await runCli(
      ["git", "commit", "--type", "feat", "--scope", "api", "--subject", "add health", "--body", "details"],
      { cwd: dir, env },
    );

    const changelog = await runCli(["git", "changelog"], { cwd: dir, env });
    expect(changelog.code).toBe(0);
    expect(changelog.out).toContain("### Features");
    expect(changelog.out).toContain("**api:** add health");
    expect(changelog.out).toContain("### Chores");

    const outFile = join(dir, "CHANGELOG.md");
    await writeFile(outFile, "old\n");
    const refused = await runCli(["git", "changelog", "--out", "CHANGELOG.md", "--json"], {
      cwd: dir,
      env,
    });
    expect(refused.code).toBe(1);
    expect(parseJson(refused.out).error?.code).toBe("EXISTS");
    const written = await runCli(["git", "changelog", "--out", "CHANGELOG.md", "--force"], {
      cwd: dir,
      env,
    });
    expect(written.code).toBe(0);
    expect(await readFile(outFile, "utf8")).toContain("# Changelog");

    await git(dir, env, ["checkout", "-b", "feature/login"]);
    await writeFile(join(dir, "c.txt"), "c\n");
    await git(dir, env, ["add", "c.txt"]);
    await git(dir, env, ["commit", "-m", "feat: login"]);
    await git(dir, env, ["checkout", "main"]);
    await git(dir, env, ["merge", "feature/login"]);
    await git(dir, env, ["checkout", "-b", "wip"]);
    await writeFile(join(dir, "d.txt"), "d\n");
    await git(dir, env, ["add", "d.txt"]);
    await git(dir, env, ["commit", "-m", "feat: wip"]);
    await git(dir, env, ["checkout", "main"]);

    const preview = await runCli(["git", "cleanup", "--dry-run"], { cwd: dir, env });
    expect(preview.code).toBe(0);
    expect(preview.out).toContain("feature/login");
    expect(preview.out).not.toContain("wip");
    expect((await git(dir, env, ["branch"])).includes("feature/login")).toBe(true);

    const removed = await runCli(["git", "cleanup", "--yes"], { cwd: dir, env });
    expect(removed.code).toBe(0);
    const names = await git(dir, env, ["branch"]);
    expect(names).not.toContain("feature/login");
    expect(names).toContain("wip");
    expect(names).toContain("main");
  });

  it("refuses cleanup outside a repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zt-not-git-"));
    dirs.push(dir);
    const result = await runCli(["git", "cleanup", "--dry-run", "--json"], { cwd: dir });
    expect(result.code).toBe(1);
    expect(parseJson(result.out).error?.code).toBe("NOT_A_REPO");
  });
});
