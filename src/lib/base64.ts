import { ZtError } from "../errors.js";

const STD = /^[A-Za-z0-9+/]*={0,2}$/;
const URL = /^[A-Za-z0-9_-]*={0,2}$/;

/** Encode UTF-8 text as standard base64, or as unpadded base64url when `url` is set. */
export function encodeBase64(input: string, url = false): string {
  const encoded = Buffer.from(input, "utf8").toString("base64");
  if (!url) return encoded;
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Decode standard base64, or base64url when `url` is set. The alphabet is checked. */
export function decodeBase64(input: string, url = false): string {
  const raw = input.trim();
  if (raw.length === 0) return "";
  if (!(url ? URL : STD).test(raw)) throw new ZtError("invalid base64", "BASE64_INVALID");
  const normalized = url ? raw.replaceAll("-", "+").replaceAll("_", "/") : raw;
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(normalized + "=".repeat(padLength), "base64").toString("utf8");
}
