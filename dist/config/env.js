import { randomBytes } from "node:crypto";
import { z } from "zod";
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default("0.0.0.0"),
    CORS_ORIGIN: z.string().default(""),
    DATABASE_URL: z.string().default("./data/moneyos.db"),
    JWT_SECRET: z.string().min(32).optional(),
    ALLOW_EPHEMERAL_SECRET: z.enum(["true", "false"]).default("false"),
    JWT_EXPIRES_IN: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    APP_NAME: z.string().default("MoneyOS"),
    DEFAULT_CURRENCY: z.string().min(3).max(3).toUpperCase().default("EGP"),
    MAILER_FROM: z.string().default("MoneyOS <no-reply@moneyos.local>"),
    /** Public base URL of the frontend, used to build password-reset links. */
    PUBLIC_APP_URL: z.string().default("http://localhost:5173"),
});
const sessionTtlDays = z
    .number()
    .int()
    .positive()
    .max(365);
const minutesToMs = (m) => m * 60 * 1000;
const daysToMs = (d) => d * 24 * 60 * 60 * 1000;
/**
 * Parses and validates process.env. In development, if `JWT_SECRET` is missing an
 * ephemeral secret is generated (sessions won't survive restarts). Production
 * requires an explicit secret and fails fast otherwise.
 */
export function loadConfig(raw = process.env) {
    const parsed = envSchema.parse(raw);
    let jwtSecret = parsed.JWT_SECRET;
    if (!jwtSecret) {
        if (parsed.NODE_ENV === "production") {
            if (parsed.ALLOW_EPHEMERAL_SECRET !== "true") {
                throw new Error("JWT_SECRET is required in production. Set it to a random value of at least 32 characters, or pass ALLOW_EPHEMERAL_SECRET=true for ephemeral sessions.");
            }
            console.warn("[moneyos] JWT_SECRET not set but ALLOW_EPHEMERAL_SECRET=true; generating an ephemeral secret (sessions reset on restart).");
        }
        else {
            console.warn("[moneyos] JWT_SECRET not set; generated an ephemeral secret for development.");
        }
        jwtSecret = randomBytes(48).toString("base64url");
    }
    const refreshTtlDays = sessionTtlDays.parse(parsed.REFRESH_TOKEN_TTL_DAYS);
    return {
        env: parsed.NODE_ENV,
        isProduction: parsed.NODE_ENV === "production",
        port: parsed.PORT,
        host: parsed.HOST,
        corsOrigins: parsed.CORS_ORIGIN.split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        databaseUrl: parsed.DATABASE_URL,
        jwtSecret,
        jwtExpiresIn: parsed.JWT_EXPIRES_IN,
        refreshTokenTtlMs: daysToMs(refreshTtlDays),
        passwordResetTtlMs: minutesToMs(parsed.PASSWORD_RESET_TTL_MINUTES),
        appName: parsed.APP_NAME,
        defaultCurrency: parsed.DEFAULT_CURRENCY,
        mailerFrom: parsed.MAILER_FROM,
        publicAppUrl: parsed.PUBLIC_APP_URL,
    };
}
//# sourceMappingURL=env.js.map