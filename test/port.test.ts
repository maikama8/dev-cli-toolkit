import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import {
  assertKillable,
  findListeners,
  parseLsof,
  parseNetstat,
  parsePort,
  parseSs,
} from "../src/lib/port.js";
import type { ExecFile } from "../src/exec.js";
import { parseJson, runCli } from "./helpers.js";

const lsof = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    4242 me    20u  IPv4  0x1      0t0  TCP *:3000 (LISTEN)
node    8080 me    21u  IPv4  0x2      0t0  TCP *:8080 (LISTEN)
`;

const ss = `State Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0 128 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4242,fd=20))
LISTEN 0 128 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=4242,fd=21))
LISTEN 0 128 *:8080 *:* users:(("node",pid=99,fd=3))
`;

const netstat = `  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4242
  TCP    [::]:3000              [::]:0                 LISTENING       4242
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       99
  UDP    0.0.0.0:3000           *:*                                    7
`;

describe("port parsers", () => {
  it("reads lsof, ss, and windows netstat without confusing 3000 and 8080", () => {
    expect(parseLsof(lsof, 3000)).toEqual([
      { command: "node", pid: 4242, user: "me", address: "*:3000" },
    ]);
    expect(parseSs(ss, 3000)).toEqual([{ command: "node", pid: 4242, address: "0.0.0.0:3000" }]);
    expect(parseNetstat(netstat, 3000)).toEqual([{ command: "pid", pid: 4242, address: "0.0.0.0:3000" }]);
    expect(parseNetstat(netstat, 8080)[0]?.pid).toBe(99);
    expect(() => parsePort("0")).toThrow(/1 to 65535/);
    expect(() => assertKillable(1, 50)).toThrow(/refusing/);
    expect(() => assertKillable(50, 50)).toThrow(/current process/);
  });

  it("falls back from ss to lsof", async () => {
    const execFile: ExecFile = async (command) => {
      if (command === "ss") return { code: 127, stdout: "", stderr: "not found" };
      if (command === "lsof") return { code: 0, stdout: lsof, stderr: "" };
      return { code: 127, stdout: "", stderr: command };
    };
    const owners = await findListeners({ execFile, platform: "linux", env: process.env }, 3000);
    expect(owners.map((owner) => owner.pid)).toEqual([4242]);
  });
});

describe("zt port", () => {
  it("kills the pid reported by the lookup and refuses the current process", async () => {
    const killed: number[] = [];
    const execFile: ExecFile = async (command) => {
      if (command === "ss") return { code: 0, stdout: ss, stderr: "" };
      return { code: 127, stdout: "", stderr: command };
    };
    const who = await runCli(["port", "who", "3000", "--json"], {
      platform: "linux",
      execFile,
    });
    expect(who.code).toBe(0);
    expect(parseJson(who.out).data?.owners).toEqual([
      { command: "node", pid: 4242, address: "0.0.0.0:3000" },
    ]);

    const needsYes = await runCli(["port", "kill", "3000", "--json"], {
      platform: "linux",
      execFile,
      kill: async (pid) => {
        killed.push(pid);
      },
    });
    expect(needsYes.code).toBe(1);
    expect(parseJson(needsYes.out).error?.code).toBe("KILL_CONFIRM");
    expect(killed).toEqual([]);

    const result = await runCli(["port", "kill", "3000", "--yes", "--json"], {
      platform: "linux",
      execFile,
      kill: async (pid) => {
        killed.push(pid);
      },
    });
    expect(result.code).toBe(0);
    expect(killed).toEqual([4242]);

    const itself = await runCli(["port", "kill", "3000", "--yes", "--json"], {
      platform: "linux",
      execFile,
      selfPid: 4242,
    });
    expect(itself.code).toBe(1);
    expect(parseJson(itself.out).error?.code).toBe("KILL_REFUSED");
  });

  it("sees a real local listener", async () => {
    const server = await new Promise<Server>((resolve) => {
      const created = createServer((_req, res) => res.end("ok"));
      created.listen(0, "127.0.0.1", () => resolve(created));
    });
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const result = await runCli(["port", "who", String(port)]);
      expect(result.code).toBe(0);
      expect(result.out).toContain(String(port));
      expect(result.out).toContain(String(process.pid));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
