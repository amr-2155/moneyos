import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: number;
}

function extractTokens(body: unknown): Tokens {
  const tokens = (body as { tokens: Tokens }).tokens;
  expect(tokens).toBeDefined();
  return tokens;
}

const PASSWORD = "correct-horse-battery";

describe("health", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = (await createTestApp()).app;
  });
  afterEach(async () => {
    await app.close();
  });

  it("GET /health reports ok and db ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  });
});

describe("auth API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  async function signup(
    email = "user@example.com",
    password = PASSWORD,
    name = "Test User",
  ) {
    return app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email, password, name },
    });
  }

  async function login(email = "user@example.com", password = PASSWORD) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
  }

  describe("signup", () => {
    it("creates a user and returns tokens", async () => {
      const res = await signup();
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.email).toBe("user@example.com");
      expect(body.user.name).toBe("Test User");
      expect(body.user.defaultCurrency).toBe("EGP");
      expect(body.user.id).toBeTypeOf("string");
      expect(extractTokens(body).accessToken).toBeTypeOf("string");
      expect(extractTokens(body).refreshToken).toBeTypeOf("string");
    });

    it("normalizes email to lowercase and trims name", async () => {
      const res = await signup("  User@Example.COM ", PASSWORD, "  Alice  ");
      const body = res.json();
      expect(body.user.email).toBe("user@example.com");
      expect(body.user.name).toBe("Alice");
    });

    it("rejects a duplicate email with 409", async () => {
      await signup();
      const res = await signup();
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("CONFLICT");
    });

    it("rejects invalid payloads with 400 VALIDATION_ERROR", async () => {
      const badEmail = await signup("not-an-email", PASSWORD);
      expect(badEmail.statusCode).toBe(400);
      expect(badEmail.json().error.code).toBe("VALIDATION_ERROR");

      const shortPassword = await signup("b@example.com", "short");
      expect(shortPassword.statusCode).toBe(400);
      expect(shortPassword.json().error.code).toBe("VALIDATION_ERROR");

      const missingName = await signup("c@example.com", PASSWORD, "");
      expect(missingName.statusCode).toBe(400);
    });
  });

  describe("login", () => {
    it("logs in with valid credentials", async () => {
      await signup();
      const res = await login();
      expect(res.statusCode).toBe(200);
      expect(extractTokens(res.json()).accessToken).toBeTypeOf("string");
    });

    it("rejects a wrong password with 401", async () => {
      await signup();
      const res = await login("user@example.com", "wrong-password");
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects an unknown email with 401 (no account enumeration)", async () => {
      const res = await login("ghost@example.com", PASSWORD);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.message).toContain("Invalid email or password");
    });
  });

  describe("authenticated profile", () => {
    it("GET /auth/me returns the user with a valid token", async () => {
      const signupRes = await signup();
      const { accessToken } = extractTokens(signupRes.json());
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe("user@example.com");
    });

    it("rejects requests without a token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects garbage tokens", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: "Bearer not-a-real-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("PATCH /auth/me updates profile fields", async () => {
      const signupRes = await signup();
      const { accessToken } = extractTokens(signupRes.json());
      const res = await app.inject({
        method: "PATCH",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: "New Name", defaultCurrency: "USD" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe("New Name");
      expect(body.defaultCurrency).toBe("USD");
    });

    it("PATCH /auth/me rejects an invalid currency and an empty payload", async () => {
      const signupRes = await signup();
      const { accessToken } = extractTokens(signupRes.json());
      const headers = { authorization: `Bearer ${accessToken}` };

      const badCurrency = await app.inject({
        method: "PATCH",
        url: "/api/auth/me",
        headers,
        payload: { defaultCurrency: "US" },
      });
      expect(badCurrency.statusCode).toBe(400);

      const empty = await app.inject({
        method: "PATCH",
        url: "/api/auth/me",
        headers,
        payload: {},
      });
      expect(empty.statusCode).toBe(400);
    });
  });

  describe("refresh tokens", () => {
    it("rotates the refresh token and invalidates the previous one", async () => {
      const signupRes = await signup();
      const first = extractTokens(signupRes.json());

      const refreshRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: first.refreshToken },
      });
      expect(refreshRes.statusCode).toBe(200);
      const second = extractTokens(refreshRes.json());
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const replayRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: first.refreshToken },
      });
      expect(replayRes.statusCode).toBe(401);
    });

    it("rejects an unknown or malformed refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: "this-token-was-never-issued" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("logout", () => {
    it("revokes the presented refresh token", async () => {
      const signupRes = await signup();
      const { refreshToken } = extractTokens(signupRes.json());

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        payload: { refreshToken },
      });
      expect(logoutRes.statusCode).toBe(204);

      const refreshRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken },
      });
      expect(refreshRes.statusCode).toBe(401);
    });

    it("is idempotent for unknown tokens", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        payload: { refreshToken: "nonexistent-token-value" },
      });
      expect(res.statusCode).toBe(204);
    });
  });

  describe("password reset", () => {
    it("sends a reset link to a known email", async () => {
      await signup();
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "user@example.com" },
      });
      expect(res.statusCode).toBe(200);
      expect(ctx.mailer.messages).toHaveLength(1);
      const text = ctx.mailer.messages[0]!.text;
      expect(text).toMatch(/\/reset-password\?token=/);
    });

    it("does not reveal whether an email exists", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "ghost@example.com" },
      });
      expect(res.statusCode).toBe(200);
      expect(ctx.mailer.messages).toHaveLength(0);
    });

    it("resets the password and revokes all sessions", async () => {
      const signupRes = await signup();
      const { refreshToken } = extractTokens(signupRes.json());

      await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "user@example.com" },
      });
      const token = ctx.mailer.messages[0]!.text.match(/token=([^\s]+)/)![1]!;

      const resetRes = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token, password: "brand-new-password" },
      });
      expect(resetRes.statusCode).toBe(200);

      const oldLogin = await login("user@example.com", PASSWORD);
      expect(oldLogin.statusCode).toBe(401);

      const newLogin = await login("user@example.com", "brand-new-password");
      expect(newLogin.statusCode).toBe(200);

      const oldSessionRefresh = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken },
      });
      expect(oldSessionRefresh.statusCode).toBe(401);
    });

    it("rejects an invalid reset token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "garbage-garbage-garbage", password: "brand-new-password" },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
