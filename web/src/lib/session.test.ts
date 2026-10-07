import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCachedSession,
  currentUserId,
  getActiveUserId,
  loadCachedSession,
  LOCAL_USER_ID,
  saveCachedSession,
  setActiveUserId,
} from "./session";

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveUserId(null);
  });

  it("falls back to the local owner id when nobody is signed in", () => {
    expect(getActiveUserId()).toBeNull();
    expect(currentUserId()).toBe(LOCAL_USER_ID);
  });

  it("uses the signed-in user id as the ownership key", () => {
    setActiveUserId("user-123");
    expect(currentUserId()).toBe("user-123");
    setActiveUserId(null);
    expect(currentUserId()).toBe(LOCAL_USER_ID);
  });

  it("round-trips a cached session", () => {
    saveCachedSession({
      id: "user-9",
      email: "amr@example.com",
      name: "Amr",
      defaultCurrency: "EGP",
      locale: "ar",
      createdAt: "2026-01-01T00:00:00.000Z",
      offline: false,
    });

    expect(loadCachedSession()).toEqual({
      id: "user-9",
      email: "amr@example.com",
      name: "Amr",
      defaultCurrency: "EGP",
      locale: "ar",
      createdAt: "2026-01-01T00:00:00.000Z",
      offline: false,
    });
  });

  it("ignores corrupt or incomplete cached sessions", () => {
    localStorage.setItem("moneyos.session", "not json");
    expect(loadCachedSession()).toBeNull();

    localStorage.setItem("moneyos.session", JSON.stringify({ id: "only-an-id" }));
    expect(loadCachedSession()).toBeNull();
  });

  it("fills sensible defaults for partial session data", () => {
    localStorage.setItem("moneyos.session", JSON.stringify({ id: "u1", email: "a@b.co" }));
    expect(loadCachedSession()).toMatchObject({
      id: "u1",
      email: "a@b.co",
      name: "a@b.co",
      defaultCurrency: "EGP",
      locale: "en",
      offline: false,
    });
  });

  it("clears the cached session", () => {
    saveCachedSession({
      id: "u1",
      email: "a@b.co",
      name: "A",
      defaultCurrency: "EGP",
      locale: "en",
      createdAt: "2026-01-01T00:00:00.000Z",
      offline: true,
    });
    clearCachedSession();
    expect(loadCachedSession()).toBeNull();
  });
});
