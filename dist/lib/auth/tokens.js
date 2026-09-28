import { jwtVerify, SignJWT } from "jose";
const ISSUER = "moneyos";
const AUDIENCE = "moneyos-api";
export async function signAccessToken(config, userId) {
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
export async function verifyAccessToken(config, token) {
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
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=tokens.js.map