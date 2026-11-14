import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCommitMessage, promptCommit, COMMIT_TYPES } from "../src/lib/commit.js";
import { parseJson, runCli, scriptedPrompter } from "./helpers.js";

describe("conventional commits", () => {
  it("builds a scoped message and a breaking-change footer", () => {
    expect(
      buildCommitMessage({
        type: "feat",
        scope: "api",
        subject: "add health route",
        body: "GET /health",
        breaking: "",
      }),
    ).toBe("feat(api): add health route\n\nGET /health");

    expect(
      buildCommitMessage({
        type: "feat",
        scope: "",
        subject: "change the payload",
        body: "",
        breaking: "drop the v1 field",
      }),
    ).toBe("feat!: change the payload\n\nBREAKING CHANGE: drop the v1 field");
  });

  it("rejects an unknown type and a multiline subject", () => {
    expect(() =>
      buildCommitMessage({ type: "wip", scope: "", subject: "nope", body: "", breaking: "" }),
    ).toThrow(/unknown commit type/);
    expect(() =>
      buildCommitMessage({ type: "fix", scope: "", subject: "one\ntwo", body: "", breaking: "" }),
    ).toThrow(/one line/);
    expect(COMMIT_TYPES).toContain("feat");
  });

  it("prompts only for the answers that were not provided", async () => {
    const answers = await promptCommit(scriptedPrompter(["cli", "add doctor", "", ""]), {
      type: "feat",
    });
    expect(answers).toEqual({
      type: "feat",
      scope: "cli",
      subject: "add doctor",
      body: "",
      breaking: "",
    });
  });
});

describe("zt git commit", () => {
  it("prints a dry run without a repository", async () => {
    const result = await runCli([
      "git",
      "commit",
      "--type",
      "docs",
      "--subject",
      "explain env check",
      "--dry-run",
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(parseJson(result.out).data?.message).toBe("docs: explain env check");
  });

  it("asks the prompter when the subject is missing in a terminal", async () => {
    const result = await runCli(["git", "commit", "--dry-run"], {
      isTTY: true,
      prompter: scriptedPrompter(["fix", "", "handle empty token", "", ""]),
    });
    expect(result.code).toBe(0);
    expect(result.out.trim()).toBe("fix: handle empty token");
  });

  it("explains how to pass a subject when there is no terminal", async () => {
    const result = await runCli(["git", "commit", "--type", "feat", "--json"]);
    expect(result.code).toBe(1);
    expect(parseJson(result.out).error?.code).toBe("COMMIT_SUBJECT");
  });

  it("rejects a bad scope and a directory that is not a repository", async () => {
    const scope = await runCli([
      "git",
      "commit",
      "--type",
      "feat",
      "--scope",
      "bad scope",
      "--subject",
      "x",
      "--dry-run",
      "--json",
    ]);
    expect(scope.code).toBe(1);
    expect(parseJson(scope.out).error?.code).toBe("COMMIT_SCOPE");

    const dir = await mkdtemp(join(tmpdir(), "zt-commit-"));
    try {
      const result = await runCli(
        ["git", "commit", "--type", "chore", "--subject", "note", "--json"],
        { cwd: dir },
      );
      expect(result.code).toBe(1);
      expect(parseJson(result.out).error?.code).toBe("NOT_A_REPO");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
