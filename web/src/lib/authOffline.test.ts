import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { setActiveUserId } from "./session";

/**
 * GitHub Pages (and any static host) answers unknown `/api/*` requests with an
 * HTML 404 page. These tests pin the behaviour that signup/login treat that as
 * "no backend" and still let the user in with a device-local account, instead
 * of surfacing a hard failure.
 */
function htmlNotFound(): Response {
  return new Response("<!DOCTYPE html><html><body>404</body></html>", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth on a host without an API", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveUserId(null);
    vi.restoreAllMocks();
  });

  it("signs the user up locally when /api/auth/signup returns an HTML 404", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(htmlNotFound());

    const { user, tokens } = await api.auth.signup({
      email: "AMR@Example.com",
      password: "supersecret",
      name: "Amr",
    });

    expect(user.email).toBe("amr@example.com");
    expect(user.id).toMatch(/^local-/);
    expect(tokens.accessToken).toBe("local");
    expect(localStorage.getItem("moneyos.accessToken")).toBe("local");
    expect(localStorage.getItem("moneyos.session")).toContain("amr@example.com");
  });

  it("signs the user in locally when /api/auth/login returns an HTML 404", async () => {
    await api.auth.signup({ email: "amr@example.com", password: "supersecret", name: "Amr" });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(htmlNotFound());

    const { user } = await api.auth.login({ email: "amr@example.com", password: "supersecret" });

    expect(user.email).toBe("amr@example.com");
    expect(user.id).toMatch(/^local-/);
  });

  it("still reports a real API rejection for login", async () => {
    await api.auth.signup({ email: "amr@example.com", password: "supersecret", name: "Amr" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Incorrect email or password" } }, 401),
    );

    await expect(api.auth.login({ email: "amr@example.com", password: "wrongpass" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("still reports a duplicate email for signup", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Email already used" } }, 409),
    );

    await expect(api.auth.signup({ email: "amr@example.com", password: "supersecret", name: "Amr" })).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });

  it("keeps the cached session when /api/auth/me answers with HTML", async () => {
    await api.auth.signup({ email: "amr@example.com", password: "supersecret", name: "Amr" });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(htmlNotFound());

    const user = await api.auth.me();

    expect(user.email).toBe("amr@example.com");
  });
});