import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CliContext, Prompter } from "../types.js";

/** Read one line from the terminal. An empty answer returns `fallback`. */
export function createReadlinePrompter(): Prompter {
  const rl = createInterface({ input, output });
  return {
    async ask(question: string, fallback = "") {
      const suffix = fallback ? ` [${fallback}]` : "";
      const answer = (await rl.question(`${question}${suffix}: `)).trim();
      return answer || fallback;
    },
    close() {
      rl.close();
    },
  };
}

/**
 * Ask a yes/no question.
 * `y` and `yes` are accepted. A caller-supplied prompter is closed afterwards.
 */
export async function confirm(
  ctx: Pick<CliContext, "prompter">,
  question: string,
  fallback = "n",
): Promise<boolean> {
  const prompter = ctx.prompter ?? createReadlinePrompter();
  try {
    const answer = await prompter.ask(question, fallback);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompter.close?.();
  }
}
