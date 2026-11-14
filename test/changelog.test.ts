import { describe, expect, it } from "vitest";
import { parseConventional, parseGitLog, renderChangelog } from "../src/lib/changelog.js";

const log = [
  "abc1234\x1ffeat(api): add health route\x1fGET /health returns ok\x1e",
  "def5678\x1ffix: trim env values\x1f\x1e",
  "aaa1111\x1ffeat(api)!: change the payload\x1fBREAKING CHANGE: drop the v1 field\x1e",
  "bbb2222\x1fmerge branch 'wip'\x1f\x1e",
].join("");

describe("changelog", () => {
  it("parses the git log separators and groups conventional commits", () => {
    const commits = parseGitLog(log).map(parseConventional);
    expect(commits.map((commit) => commit.type)).toEqual(["feat", "fix", "feat", "other"]);
    expect(commits[2]?.breaking).toBe(true);
    expect(commits[2]?.breakingNote).toContain("drop the v1 field");
    const markdown = renderChangelog(commits);
    expect(markdown).toContain("### Breaking changes");
    expect(markdown).toContain("**api:** drop the v1 field (`aaa1111`)");
    expect(markdown).toContain("### Features");
    expect(markdown).toContain("**api:** add health route (`abc1234`)");
    expect(markdown).toContain("### Fixes");
    expect(markdown).toContain("- trim env values (`def5678`)");
    expect(markdown).toContain("### Other");
    expect(markdown).toContain("merge branch 'wip'");
  });

  it("says when the range is empty", () => {
    expect(renderChangelog([])).toContain("No commits in range.");
  });
});
