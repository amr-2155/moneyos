import { createHash, randomBytes, randomUUID } from "node:crypto";

/** Generates a cryptographically secure random token string (URL-safe). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest used to store sensitive tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** UUID v4 for identifiers that don't use the cuid2 default. */
export function uuid(): string {
  return randomUUID();
}
