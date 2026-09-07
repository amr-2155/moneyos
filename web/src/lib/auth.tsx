import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getAccessToken, setTokens, type PublicUser } from "./api";
import { startSyncEngine } from "./sync";
import { db, type UserRecord, type AccountRecord, type CategoryRecord, type TransactionRecord, type TransferRecord, type BudgetRecord, type SavingsGoalRecord, type SavingsContributionRecord } from "./db";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  updateUser: (patch: { name?: string; defaultCurrency?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const me = await api.auth.me();
        if (!cancelled) setUser(me);

        // If no real JWT token is stored, attempt backend auth to get one.
        // This enables authenticated API calls (e.g. analytics) in dev.
        const token = getAccessToken();
        if (!token || token === "local") {
          try {
            // Try login first; fall back to signup on 401 (user not yet created).
            const credentials = { email: me.email, password: "local", name: me.name };
            let res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: me.email, password: "local" }),
            });
            if (res.status === 401) {
              res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials),
              });
            }
            if (res.ok) {
              const data = await res.json() as { tokens: { accessToken: string; refreshToken: string } };
              if (data.tokens.accessToken && data.tokens.accessToken !== "local") {
                setTokens(data.tokens.accessToken, data.tokens.refreshToken);
              }
            }
          } catch {
            // Backend unavailable — stay in local-only mode.
          }
        }
      } catch {
        // Local Dexie unavailable — try backend auth only.
        try {
          const result = await api.auth.login({
            email: "user@moneyos.local",
            password: "local",
          });
          if (!cancelled) setUser(result.user);
        } catch {
          // IndexedDB might be unavailable
        }
      } finally {
        if (!cancelled) setLoading(false);
        startSync();
      }
    }
    void restore();
    return () => { cancelled = true; stopSync(); };
  }, []);

  const updateUser = useCallback(async (patch: { name?: string; defaultCurrency?: string }) => {
    const updated = await api.auth.updateMe(patch);
    setUser(updated);
  }, []);

  const logout = useCallback(async () => {
    stopSync();
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, updateUser, logout }),
    [user, loading, updateUser, logout],
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
