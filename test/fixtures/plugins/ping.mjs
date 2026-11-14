export const name = "ping";
export const description = "ping";

export function register(program, ctx) {
  program.command("ping").action(() => ctx.output.ok({ pong: true }, "pong"));
}
