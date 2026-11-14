import { randomUUID } from "node:crypto";
import type { Paint } from "../paint.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL = "00000000-0000-0000-0000-000000000000";

/** The result of checking one UUID. The nil UUID is valid and has no version. */
export interface UuidCheck {
  uuid: string;
  valid: boolean;
  version: number | null;
  nil: boolean;
}

/** Generate one UUID v4. */
export function generateUuid(): string {
  return randomUUID();
}

/** Check a UUID string. Versions 1 through 8 are accepted. The nil UUID has no version. */
export function checkUuid(value: string): UuidCheck {
  const uuid = value.trim();
  if (uuid.toLowerCase() === NIL) return { uuid, valid: true, version: null, nil: true };
  if (!UUID.test(uuid)) return { uuid, valid: false, version: null, nil: false };
  return { uuid, valid: true, version: Number(uuid.charAt(14)), nil: false };
}

/** Format a UUID check for a terminal. */
export function formatUuidCheck(check: UuidCheck, paint: Paint): string {
  if (!check.valid) return paint.red(`invalid uuid ${check.uuid}`);
  if (check.nil) return "valid nil uuid";
  return paint.green(`valid uuid v${check.version}`);
}
