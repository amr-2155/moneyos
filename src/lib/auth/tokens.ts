import { jwtVerify, SignJWT } from "jose";
import type { AppConfig } from "../../config/env.js";

/** Claim stored in the signed access token. */
export interface AccessTokenPayload {
  sub: string;
}

const ISSUER = "moneyos";
const AUDIENCE = "moneyos-api";

export async function signAccessToken(config: AppConfig, userId: string): Promise<string> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

/**
 * Verifies the access token and returns the subject (userId) or null when invalid.
 */
export async function verifyAccessToken(config: AppConfig, token: string): Promise<string | null> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
