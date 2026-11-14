import { ZtError } from "../errors.js";
import type { Paint } from "../paint.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
const MAX_BODY = 1_000_000;

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface HttpReport {
  method: string;
  url: string;
  status: number;
  statusText: string;
  ms: number;
  bytes: number;
  headers: Record<string, string>;
  body: string;
  json: unknown | null;
  truncated: boolean;
}

export function resolveRequest(
  methodOrUrl: string | undefined,
  maybeUrl: string | undefined,
  hasBody: boolean,
): { method: string; url: string } {
  if (!methodOrUrl) throw new ZtError("a URL is required", "HTTP_URL");
  if (!maybeUrl) return { method: hasBody ? "POST" : "GET", url: methodOrUrl };
  return { method: methodOrUrl, url: maybeUrl };
}

export function parseHeaders(raw: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of raw) {
    const index = entry.indexOf(":");
    if (index <= 0) throw new ZtError(`invalid header "${entry}" (use Name: value)`, "HTTP_HEADER");
    const name = entry.slice(0, index).trim();
    const value = entry.slice(index + 1).trim();
    if (!name) throw new ZtError(`invalid header "${entry}"`, "HTTP_HEADER");
    headers[name] = value;
  }
  return headers;
}

export async function performHttp(input: HttpRequest, fetchImpl: typeof fetch): Promise<HttpReport> {
  const method = input.method.toUpperCase();
  if (!METHODS.has(method)) throw new ZtError(`unsupported method ${method}`, "HTTP_METHOD");
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new ZtError(`invalid URL "${input.url}"`, "HTTP_URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ZtError("only http and https URLs are supported", "HTTP_URL");
  }
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(parsed, {
      method,
      headers: input.headers,
      body: method === "GET" || method === "HEAD" ? undefined : input.body,
      signal: AbortSignal.timeout(input.timeoutMs),
      redirect: "follow",
    });
  } catch (err) {
    throw new ZtError(`request failed: ${(err as Error).message}`, "HTTP_FAILED");
  }
  const ms = Math.max(0, Math.round(performance.now() - started));
  const buffer = Buffer.from(await response.arrayBuffer());
  const truncated = buffer.length > MAX_BODY;
  const body = (truncated ? buffer.subarray(0, MAX_BODY) : buffer).toString("utf8");
  const type = response.headers.get("content-type") ?? "";
  let json: unknown | null = null;
  const trimmed = body.trim();
  if (type.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    method,
    url: parsed.toString(),
    status: response.status,
    statusText: response.statusText,
    ms,
    bytes: buffer.length,
    headers,
    body,
    json,
    truncated,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatHttp(report: HttpReport, paint: Paint, includeHeaders: boolean): string {
  const color = report.status >= 400 ? paint.red : report.status >= 300 ? paint.yellow : paint.green;
  const lines = [
    `${paint.bold(report.method)} ${report.url}`,
    `${color(String(report.status))} ${report.statusText}  ${report.ms} ms  ${formatBytes(report.bytes)}`,
  ];
  if (includeHeaders) {
    for (const [key, value] of Object.entries(report.headers)) {
      lines.push(paint.dim(`${key}: ${value}`));
    }
  }
  lines.push("");
  if (report.json !== null) lines.push(JSON.stringify(report.json, null, 2));
  else if (report.body.includes("\u0000")) lines.push(paint.dim("(binary body omitted)"));
  else if (report.body.length > 0) lines.push(report.body.trimEnd());
  if (report.truncated) lines.push(paint.yellow("body truncated to 1 MB"));
  return lines.join("\n");
}
