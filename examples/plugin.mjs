export default {
  name: "hello",
  description: "Say hello from a zt plugin",
  register(program, ctx) {
    program
      .command("hello")
      .description("Say hello from a zt plugin")
      .argument("[name]", "who to greet", "world")
      .option("--json", "print machine-readable JSON")
      .action((name) => {
        ctx.output.ok({ greeting: `Hello, ${name}` }, `Hello, ${name}`);
      });
  },
};
