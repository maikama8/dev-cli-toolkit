import { ZtError } from "../errors.js";
import type { Prompter } from "../types.js";

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

const TYPE_SET = new Set<string>(COMMIT_TYPES);

export interface CommitAnswers {
  type: string;
  scope: string;
  subject: string;
  body: string;
  breaking: string;
}

export async function promptCommit(
  prompter: Prompter,
  partial: Partial<CommitAnswers>,
): Promise<CommitAnswers> {
  const type = partial.type?.trim() || (await prompter.ask(`type (${COMMIT_TYPES.join("|")})`, "feat"));
  const scope = partial.scope !== undefined ? partial.scope : await prompter.ask("scope", "");
  const subject = partial.subject?.trim() || (await prompter.ask("subject", ""));
  const body = partial.body !== undefined ? partial.body : await prompter.ask("body", "");
  const breaking =
    partial.breaking !== undefined ? partial.breaking : await prompter.ask("breaking change", "");
  return {
    type: type.trim(),
    scope: scope.trim(),
    subject: subject.trim(),
    body: body.trim(),
    breaking: breaking.trim(),
  };
}

export function buildCommitMessage(input: CommitAnswers): string {
  const type = input.type.trim();
  if (!type) throw new ZtError("a type is required (pass --type, or run in a terminal)", "COMMIT_TYPE");
  if (!TYPE_SET.has(type)) {
    throw new ZtError(`unknown commit type "${type}". Use ${COMMIT_TYPES.join(", ")}`, "COMMIT_TYPE");
  }
  const subject = input.subject.trim();
  if (!subject) {
    throw new ZtError("a subject is required (pass --subject, or run in a terminal)", "COMMIT_SUBJECT");
  }
  if (subject.includes("\n")) throw new ZtError("subject must be one line", "COMMIT_SUBJECT");
  const scope = input.scope.trim();
  if (scope && !/^[A-Za-z0-9._/-]+$/.test(scope)) {
    throw new ZtError(`invalid scope "${scope}"`, "COMMIT_SCOPE");
  }
  const breaking = input.breaking.trim();
  const bang = breaking ? "!" : "";
  const head = scope ? `${type}(${scope})${bang}: ${subject}` : `${type}${bang}: ${subject}`;
  const parts = [head];
  if (input.body.trim()) parts.push(input.body.trim());
  if (breaking) parts.push(`BREAKING CHANGE: ${breaking}`);
  return parts.join("\n\n");
}
