import { execFile as execFileCb } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { projectName, renderFiles } from "../src/lib/templates.js";
import { parseJson, runCli } from "./helpers.js";

const exec = promisify(execFileCb);
const dirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("project names", () => {
  it("slugifies a directory name", () => {
    expect(projectName("My API")).toBe("my-api");
    expect(projectName("...")).toBe("app");
    expect(renderFiles({ "a.txt": "name={{name}}" }, "demo")["a.txt"]).toBe("name=demo");
  });
});

describe("zt init", () => {
  it("lists templates", async () => {
    const result = await runCli(["init", "--list"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("node-api");
    expect(result.out).toContain("react-app");
    expect(result.out).toContain("python-api");
  });

  it("refuses an unknown template and a file that already exists", async () => {
    const unknown = await runCli(["init", "rails-app", "--json"]);
    expect(unknown.code).toBe(1);
    expect(parseJson(unknown.out).error?.code).toBe("TEMPLATE");

    const dir = await mkdtemp(join(tmpdir(), "zt-init-"));
    dirs.push(dir);
    await writeFile(join(dir, "README.md"), "keep\n");
    const clash = await runCli(["init", "node-api", dir, "--json"], { cwd: dir });
    expect(clash.code).toBe(1);
    expect(parseJson(clash.out).error?.code).toBe("EXISTS");
  });

  it("scaffolds a node API that node can parse", async () => {
    const parent = await mkdtemp(join(tmpdir(), "zt-init-"));
    dirs.push(parent);
    const result = await runCli(["init", "node-api", "Billing API", "--json"], { cwd: parent });
    expect(result.code).toBe(0);
    const data = parseJson(result.out).data;
    expect(data?.name).toBe("billing-api");
    const root = join(parent, "Billing API");
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("billing-api");
    const server = await readFile(join(root, "src/server.js"), "utf8");
    expect(server).toContain('name: "billing-api"');
    expect(server).not.toContain("{{name}}");
    await exec(process.execPath, ["--check", join(root, "src/server.js")]);
  });

  it("scaffolds react and python projects", async () => {
    const parent = await mkdtemp(join(tmpdir(), "zt-init-"));
    dirs.push(parent);
    expect((await runCli(["init", "react-app", "web"], { cwd: parent })).code).toBe(0);
    const pkg = JSON.parse(await readFile(join(parent, "web", "package.json"), "utf8")) as {
      scripts: { dev: string };
    };
    expect(pkg.scripts.dev).toBe("vite");
    await exec(process.execPath, ["--check", join(parent, "web", "vite.config.js")]);
    const app = await readFile(join(parent, "web", "src/App.jsx"), "utf8");
    expect(app).toContain("<h1>web</h1>");

    expect((await runCli(["init", "python-api", "jobs"], { cwd: parent })).code).toBe(0);
    const source = await readFile(join(parent, "jobs", "app.py"), "utf8");
    expect(source).toContain('"name": "jobs"');
    await access(join(parent, "jobs", ".env.example"));
    try {
      await exec("python3", ["-m", "py_compile", join(parent, "jobs", "app.py")]);
    } catch {
      await exec("python", ["-m", "py_compile", join(parent, "jobs", "app.py")]);
    }
  });

  it("overwrites with --force", async () => {
    const parent = await mkdtemp(join(tmpdir(), "zt-init-"));
    dirs.push(parent);
    await runCli(["init", "node-api", "api"], { cwd: parent });
    const again = await runCli(["init", "node-api", "api", "--force"], { cwd: parent });
    expect(again.code).toBe(0);
    expect(again.out).toContain("created api from node-api");
  });
});
