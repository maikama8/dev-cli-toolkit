/** ANSI wrappers. Each method returns the text unchanged when color is off. */
export interface Paint {
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
}

/** Build painters. `enabled` false returns the input text. */
export function createPaint(enabled: boolean): Paint {
  const wrap = (code: string) => (text: string) =>
    enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
  };
}

/**
 * Decide whether to colorize.
 * JSON and `--no-color` win, then `--color`, then `NO_COLOR`, then config, then the terminal.
 */
export function resolveColor(input: {
  json: boolean;
  colorFlag?: boolean;
  noColorFlag?: boolean;
  configColor?: boolean;
  noColorEnv: boolean;
  isTTY: boolean;
}): boolean {
  if (input.json || input.noColorFlag) return false;
  if (input.colorFlag) return true;
  if (input.noColorEnv) return false;
  if (input.configColor === false) return false;
  if (input.configColor === true) return true;
  return input.isTTY;
}
