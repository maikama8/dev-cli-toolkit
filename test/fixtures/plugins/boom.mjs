export default {
  name: "boom",
  description: "boom",
  register(program) {
    program.command("boom").action(() => {
      throw new Error("boom");
    });
  },
};
