import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getAccessToken, type PublicUser } from "./api";
import { startSyncEngine } from "./sync";
import { setActiveUserId } from "./session";
import { db, type UserRecord, type AccountRecord, type CategoryRecord, type TransactionRecord, type TransferRecord, type BudgetRecord, type SavingsGoalRecord, type SavingsContributionRecord } from "./db";

interface AuthContextValue {
  /** Signed-in user, or null when the user must authenticate first. */
  user: PublicUser | null;
  loading: boolean;
  /** True when the session is device-local (backend unreachable / not yet synced). */
  offline: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: { name?: string; defaultCurrency?: string }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ resetToken: string | null }>;
  resetPassword: (token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const syncStopRef = useRef<(() => void) | null>(null);

  const startSync = useCallback(() => {
    const token = getAccessToken();
    if (!token || token === "local") return;
    if (syncStopRef.current) return; // already running
    const [stop] = startSyncEngine();
    syncStopRef.current = stop;
  }, []);

  const stopSync = useCallback(() => {
    if (syncStopRef.current) {
      syncStopRef.current();
      syncStopRef.current = null;
    }
  }, []);

  const applyUser = useCallback((next: PublicUser | null) => {
    setUser(next);
    setActiveUserId(next?.id ?? null);
    setOffline(getAccessToken() === "local");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const me = (await api.auth.me()) as PublicUser | undefined;
        if (cancelled) return;
        if (me) {
          applyUser(me);
          startSync();
        } else {
          applyUser(null);
        }
      } catch {
        // No usable session on this device — the user must sign in.
        if (!cancelled) applyUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [applyUser, startSync, stopSync]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login({ email, password });
      applyUser(result.user);
      startSync();
    },
    [applyUser, startSync],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await api.auth.signup({ name, email, password });
      applyUser(result.user);
      startSync();
    },
    [applyUser, startSync],
  );

  const signOut = useCallback(async () => {
    stopSync();
    await api.auth.logout();
    applyUser(null);
  }, [applyUser, stopSync]);

  const updateUser = useCallback(async (patch: { name?: string; defaultCurrency?: string }) => {
    const updated = (await api.auth.updateMe(patch)) as PublicUser;
    setUser(updated);
  }, []);

  const requestPasswordReset = useCallback(
    async (email: string) => api.auth.forgotPassword(email),
    [],
  );

  const resetPassword = useCallback(async (token: string, password: string) => {
    await api.auth.resetPassword(token, password);
  }, []);

  const value = useMemo(
    () => ({ user, loading, offline, signIn, signUp, signOut, updateUser, requestPasswordReset, resetPassword }),
    [user, loading, offline, signIn, signUp, signOut, updateUser, requestPasswordReset, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export async function exportAllData(): Promise<Record<string, unknown>> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    users: await db.users.toArray(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    transfers: await db.transfers.toArray(),
    budgets: await db.budgets.toArray(),
    savingsGoals: await db.savingsGoals.toArray(),
    savingsContributions: await db.savingsContributions.toArray(),
  };
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  await db.transaction("rw", [db.users, db.accounts, db.categories, db.transactions, db.transfers, db.budgets, db.savingsGoals, db.savingsContributions], async () => {
    await db.users.clear();
    await db.accounts.clear();
    await db.categories.clear();
    await db.transactions.clear();
    await db.transfers.clear();
    await db.budgets.clear();
    await db.savingsGoals.clear();
    await db.savingsContributions.clear();

    if (Array.isArray(data.users)) await db.users.bulkPut(data.users as UserRecord[]);
    if (Array.isArray(data.accounts)) await db.accounts.bulkPut(data.accounts as AccountRecord[]);
    if (Array.isArray(data.categories)) await db.categories.bulkPut(data.categories as CategoryRecord[]);
    if (Array.isArray(data.transactions)) await db.transactions.bulkPut(data.transactions as TransactionRecord[]);
    if (Array.isArray(data.transfers)) await db.transfers.bulkPut(data.transfers as TransferRecord[]);
    if (Array.isArray(data.budgets)) await db.budgets.bulkPut(data.budgets as BudgetRecord[]);
    if (Array.isArray(data.savingsGoals)) await db.savingsGoals.bulkPut(data.savingsGoals as SavingsGoalRecord[]);
    if (Array.isArray(data.savingsContributions)) await db.savingsContributions.bulkPut(data.savingsContributions as SavingsContributionRecord[]);
  });
}

export async function deleteAllData(): Promise<void> {
  await db.transaction("rw", [db.users, db.accounts, db.categories, db.transactions, db.transfers, db.budgets, db.savingsGoals, db.savingsContributions], async () => {
    await db.users.clear();
    await db.accounts.clear();
    await db.categories.clear();
    await db.transactions.clear();
    await db.transfers.clear();
    await db.budgets.clear();
    await db.savingsGoals.clear();
    await db.savingsContributions.clear();
  });
}

export async function exportCSV(): Promise<string> {
  const txs = await db.transactions.toArray();
  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const header = "Date,Type,Amount,Currency,Account,Category,Description,Notes";
  const rows = txs
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((tx) => {
      const amount = (tx.amountMinor / 100).toFixed(2);
      const account = accountMap.get(tx.accountId) ?? "";
      const category = categoryMap.get(tx.categoryId ?? "") ?? "";
      const desc = (tx.description ?? "").replace(/"/g, '""');
      const notes = (tx.notes ?? "").replace(/"/g, '""');
      return `"${tx.date}","${tx.type}","${amount}","${tx.currency}","${account}","${category}","${desc}","${notes}"`;
    });

  return [header, ...rows].join("\n");
}
