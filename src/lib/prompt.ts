import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Prompter } from "../types.js";

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
