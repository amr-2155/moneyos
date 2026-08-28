import { randomBytes } from "node:crypto";

/** URL-safe, collision-resistant id (128 bits of randomness, base64url). */
export function createId(): string {
  return randomBytes(16).toString("base64url");
}
