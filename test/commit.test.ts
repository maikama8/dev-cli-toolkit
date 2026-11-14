import { describe, expect, it } from "vitest";
import { buildCommitMessage, promptCommit, COMMIT_TYPES } from "../src/lib/commit.js";
import type { Prompter } from "../src/types.js";
import { parseJson, runCli } from "./helpers.js";

function scripted(answers: string[]): Prompter {
  const pending = [...answers];
  return {
    async ask(_question: string, fallback = "") {
      return pending.shift() ?? fallback;
    },
  };
}

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
    const answers = await promptCommit(scripted(["cli", "add doctor", "", ""]), {
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
      prompter: scripted(["fix", "", "handle empty token", "", ""]),
    });
    expect(result.code).toBe(0);
    expect(result.out.trim()).toBe("fix: handle empty token");
  });

  it("explains how to pass a subject when there is no terminal", async () => {
    const result = await runCli(["git", "commit", "--type", "feat", "--json"]);
    expect(result.code).toBe(1);
    expect(parseJson(result.out).error?.code).toBe("COMMIT_SUBJECT");
  });
});
