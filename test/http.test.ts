import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { formatBytes, performHttp, resolveRequest } from "../src/lib/http.js";
import { parseJson, runCli } from "./helpers.js";

describe("http helpers", () => {
  it("defaults a body to POST and rejects other schemes", () => {
    expect(resolveRequest("https://example.com/items", undefined, true)).toEqual({
      method: "POST",
      url: "https://example.com/items",
    });
    expect(resolveRequest("PUT", "https://example.com", false)).toEqual({
      method: "PUT",
      url: "https://example.com",
    });
  });

  it("formats byte sizes", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("zt http", () => {
  it("posts to a local server and reports status and timing", async () => {
    const server = await listen();
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const ok = await runCli(["http", `http://127.0.0.1:${port}/health`, "--include"]);
      expect(ok.code).toBe(0);
      expect(ok.out).toContain("GET");
      expect(ok.out).toContain("200");
      expect(ok.out).toContain('"status": "ok"');
      expect(ok.out).toMatch(/\d+ ms/);

      const posted = await runCli([
        "http",
        "POST",
        `http://127.0.0.1:${port}/echo`,
        "--header",
        "content-type: application/json",
        "--data",
        '{"n":2}',
        "--json",
      ]);
      expect(posted.code).toBe(0);
      const body = parseJson(posted.out);
      expect(body.data?.status).toBe(200);
      expect(body.data?.json).toEqual({ echo: { n: 2 } });

      const failed = await runCli(["http", `http://127.0.0.1:${port}/missing`, "--fail", "--json"]);
      expect(failed.code).toBe(1);
      expect(parseJson(failed.out).error?.code).toBe("HTTP_STATUS");
    } finally {
      await close(server);
    }
  });

  it("refuses a non-http URL and surfaces a fetch failure", async () => {
    const refused = await runCli(["http", "file:///etc/passwd", "--json"]);
    expect(refused.code).toBe(1);
    expect(parseJson(refused.out).error?.code).toBe("HTTP_URL");

    const fetchImpl: typeof fetch = async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new Error("boom");
    };
    const down = await runCli(["http", "https://example.com"], { fetch: fetchImpl });
    expect(down.code).toBe(1);
    expect(down.out).toContain("boom");
  });

  it("passes the abort signal through performHttp", async () => {
    const report = await performHttp(
      { method: "GET", url: "https://example.com/a", headers: {}, timeoutMs: 50 },
      async () => new Response("plain", { status: 200, statusText: "OK" }),
    );
    expect(report.body).toBe("plain");
    expect(report.json).toBeNull();
    expect(report.ms).toBeGreaterThanOrEqual(0);
  });
});

function listen(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ echo: raw ? JSON.parse(raw) : null }));
      });
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
