export interface LogCommit {
  hash: string;
  subject: string;
  body: string;
}

export interface ParsedCommit {
  hash: string;
  type: string;
  scope: string;
  subject: string;
  breaking: boolean;
  breakingNote: string;
}

const HEADER =
  /^(?<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<subject>.+)$/;

const SECTIONS: { type: string; title: string }[] = [
  { type: "feat", title: "Features" },
  { type: "fix", title: "Fixes" },
  { type: "perf", title: "Performance" },
  { type: "refactor", title: "Refactoring" },
  { type: "docs", title: "Documentation" },
  { type: "test", title: "Tests" },
  { type: "build", title: "Build" },
  { type: "ci", title: "CI" },
  { type: "chore", title: "Chores" },
  { type: "style", title: "Style" },
  { type: "revert", title: "Reverts" },
  { type: "other", title: "Other" },
];

export function parseGitLog(stdout: string): LogCommit[] {
  const commits: LogCommit[] = [];
  for (const record of stdout.split("\x1e")) {
    const trimmed = record.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (!trimmed.trim()) continue;
    const first = trimmed.indexOf("\x1f");
    const second = first === -1 ? -1 : trimmed.indexOf("\x1f", first + 1);
    if (first === -1 || second === -1) continue;
    commits.push({
      hash: trimmed.slice(0, first).trim(),
      subject: trimmed.slice(first + 1, second).trim(),
      body: trimmed.slice(second + 1).trim(),
    });
  }
  return commits;
}

export function parseConventional(commit: LogCommit): ParsedCommit {
  const match = HEADER.exec(commit.subject);
  const footer = commit.body.match(/BREAKING CHANGE:\s*([\s\S]*)$/);
  const breakingNote = footer?.[1]?.trim() ?? "";
  if (!match?.groups) {
    return {
      hash: commit.hash,
      type: "other",
      scope: "",
      subject: commit.subject,
      breaking: Boolean(footer),
      breakingNote,
    };
  }
  const marked = Boolean(match.groups.breaking);
  return {
    hash: commit.hash,
    type: match.groups.type ?? "other",
    scope: match.groups.scope ?? "",
    subject: match.groups.subject ?? commit.subject,
    breaking: marked || Boolean(footer),
    breakingNote: breakingNote || (marked ? (match.groups.subject ?? "") : ""),
  };
}

export function renderChangelog(commits: ParsedCommit[]): string {
  const lines = ["# Changelog", "", "## Unreleased", ""];
  if (commits.length === 0) {
    lines.push("No commits in range.", "");
    return lines.join("\n");
  }
  const breaking = commits.filter((commit) => commit.breaking);
  if (breaking.length > 0) {
    lines.push("### Breaking changes", "");
    for (const commit of breaking) lines.push(bullet(commit, commit.breakingNote || commit.subject));
    lines.push("");
  }
  for (const section of SECTIONS) {
    const group = commits.filter((commit) => commit.type === section.type);
    if (group.length === 0) continue;
    lines.push(`### ${section.title}`, "");
    for (const commit of group) lines.push(bullet(commit, commit.subject));
    lines.push("");
  }
  return lines.join("\n");
}

function bullet(commit: ParsedCommit, text: string): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const hash = commit.hash ? ` (\`${commit.hash}\`)` : "";
  return `- ${scope}${text}${hash}`;
}

export function commitRange(from?: string, to?: string): string | undefined {
  if (!from && !to) return undefined;
  if (from && to) return `${from}..${to}`;
  if (from) return `${from}..HEAD`;
  return to;
}
