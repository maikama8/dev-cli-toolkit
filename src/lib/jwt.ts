import { decodeBase64 } from "./base64.js";
import { ZtError } from "../errors.js";
import type { Paint } from "../paint.js";

export interface JwtReport {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signaturePresent: boolean;
  expired: boolean;
  notYetValid: boolean;
  expiresAt: string | null;
  notBefore: string | null;
  issuedAt: string | null;
}

// The signature is reported as present or absent. It is never verified.
export function decodeJwt(token: string, now: Date): JwtReport {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new ZtError("a JWT has three dot-separated parts", "JWT_SHAPE");
  const header = parsePart(parts[0] ?? "", "header");
  const payload = parsePart(parts[1] ?? "", "payload");
  const exp = numericClaim(payload, "exp");
  const nbf = numericClaim(payload, "nbf");
  const iat = numericClaim(payload, "iat");
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    header,
    payload,
    signaturePresent: (parts[2] ?? "").length > 0,
    expired: exp !== null && exp < seconds,
    notYetValid: nbf !== null && nbf > seconds,
    expiresAt: exp === null ? null : new Date(exp * 1000).toISOString(),
    notBefore: nbf === null ? null : new Date(nbf * 1000).toISOString(),
    issuedAt: iat === null ? null : new Date(iat * 1000).toISOString(),
  };
}

export function formatJwt(report: JwtReport, paint: Paint): string {
  const lines = [paint.bold("header")];
  for (const [key, value] of Object.entries(report.header)) {
    lines.push(`  ${key}  ${show(value)}`);
  }
  lines.push("", paint.bold("payload"));
  for (const [key, value] of Object.entries(report.payload)) {
    lines.push(`  ${key}  ${show(value)}`);
  }
  if (report.expiresAt) lines.push("", `expires  ${report.expiresAt}`);
  lines.push("", paint.dim("signature not verified"));
  if (report.expired) lines.push(paint.red("expired"));
  if (report.notYetValid) lines.push(paint.yellow("not valid yet"));
  return lines.join("\n");
}

function parsePart(part: string, name: string): Record<string, unknown> {
  if (!part) throw new ZtError(`JWT ${name} is empty`, "JWT_DECODE");
  let text: string;
  try {
    text = decodeBase64(part, true);
  } catch {
    throw new ZtError(`JWT ${name} is not valid base64url`, "JWT_DECODE");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ZtError(`JWT ${name} is not a JSON object`, "JWT_DECODE");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ZtError(`JWT ${name} is not a JSON object`, "JWT_DECODE");
  }
  return value as Record<string, unknown>;
}

function numericClaim(payload: Record<string, unknown>, name: string): number | null {
  const value = payload[name];
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ZtError(`JWT claim ${name} must be a number`, "JWT_CLAIM");
  }
  return value;
}

function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
