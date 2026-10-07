/**
 * Device session state for MoneyOS.
 *
 * MoneyOS is local-first: every financial record lives in IndexedDB (Dexie)
 * keyed by an owner id. This module owns that owner id plus a cached copy of
 * the signed-in profile, so the app keeps working — fully offline — when the
 * backend is unreachable, and so two accounts on the same device never share
 * financial records.
 *
 * It deliberately has **no imports** (no Dexie, no api.ts) to avoid cycles.
 */

/** Fallback owner id used only when no user has ever signed in on this device. */
export const LOCAL_USER_ID = "local-user";

const SESSION_KEY = "moneyos.session";

export interface CachedSession {
  id: string;
  email: string;
  name: string;
  defaultCurrency: string;
  locale: string;
  createdAt: string;
  /** True when the session was created without a reachable backend. */
  offline: boolean;
}

let activeUserId: string | null = null;

/** Sets the owner id used for all local (Dexie) records. */
export function setActiveUserId(id: string | null): void {
  activeUserId = id;
}

/** Returns the owner id of the signed-in user, or null when signed out. */
export function getActiveUserId(): string | null {
  return activeUserId;
}

/** Ownership key for local records. Never throws, always returns a string. */
export function currentUserId(): string {
  return activeUserId ?? LOCAL_USER_ID;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the persisted session profile (used to restore the app offline). */
export function loadCachedSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const id = readString(record, "id");
    const email = readString(record, "email");
    if (!id || !email) {
      return null;
    }
    return {
      id,
      email,
      name: readString(record, "name") ?? email,
      defaultCurrency: readString(record, "defaultCurrency") ?? "EGP",
      locale: readString(record, "locale") ?? "en",
      createdAt: readString(record, "createdAt") ?? new Date().toISOString(),
      offline: record.offline === true,
    };
  } catch {
    return null;
  }
}

export function saveCachedSession(session: CachedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode) — session stays in memory only.
  }
}

export function clearCachedSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
