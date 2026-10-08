import { db, uid, type UserRecord, type AccountRecord, type CategoryRecord, type TransactionRecord, type TransferRecord, type BudgetRecord, type SavingsGoalRecord, type SavingsContributionRecord } from "./db";
import { enqueueSync, toSyncPayload, type SyncEntityType, type SyncOperationType } from "./sync";
import { parseAmountToMinor } from "./money";
import {
  clearCachedSession,
  currentUserId,
  loadCachedSession,
  saveCachedSession,
  setActiveUserId,
} from "./session";

const TOKEN_KEY = "moneyos.accessToken";
const REFRESH_KEY = "moneyos.refreshToken";

/**
 * Enqueues a sync operation for later background sync.
 * Type-safe: accepts any object as payload; toSyncPayload strips userId internally.
 */
async function queueSync<T extends object>(
  entity: SyncEntityType,
  operation: SyncOperationType,
  entityId: string,
  payload: T,
): Promise<void> {
  await enqueueSync(entity, entityId, operation, toSyncPayload(payload));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  defaultCurrency: string;
  locale: string;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: number;
}

export interface AccountView {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  balanceMinor: number;
  isActive: boolean;
  createdAt: string;
}

export interface CategoryView {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  parentId: string | null;
  icon: string | null;
  color: string | null;
  system: boolean;
  isArchived: boolean;
}

export interface TransactionView {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: string;
  amountMinor: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
  description: string | null;
  notes: string | null;
  date: string;
  transferId: string | null;
  reversalOfId: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface TransferView {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  date: string;
  reversedAt: string | null;
  createdAt: string;
  legs: TransactionView[];
}

export interface DashboardView {
  month: string;
  currency: string;
  balances: { currency: string; amountMinor: number }[];
  totalBalanceMinor: number;
  monthSummary: {
    incomeMinor: number;
    expensesMinor: number;
    savingsMinor: number;
    savingsRatePercent: number | null;
  };
  spendingByCategory: {
    categoryId: string | null;
    categoryName: string;
    icon: string | null;
    color: string | null;
    amountMinor: number;
    percentOfTotal: number;
  }[];
  trend: { month: string; incomeMinor: number; expensesMinor: number }[];
  recentTransactions: TransactionView[];
  accountBalances: { accountId: string; name: string; currency: string; balanceMinor: number }[];
}

export type BudgetStatus = "normal" | "approaching" | "exceeded";

export interface BudgetView {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string | null;
  color: string | null;
  period: string;
  amount: string;
  amountMinor: number;
  currency: string;
  spent: string;
  spentMinor: number;
  remaining: string;
  remainingMinor: number;
  percentUsed: number;
  status: BudgetStatus;
  warningThresholdPercent: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalView {
  id: string;
  name: string;
  targetAmount: string;
  targetAmountMinor: number;
  currentAmount: string;
  currentMinor: number;
  currency: string;
  targetDate: string | null;
  description: string | null;
  progressPercent: number;
  achieved: boolean;
  remainingAmount: string;
  remainingMinor: number;
  isArchived: boolean;
  estimates: {
    requiredMonthly: string | null;
    requiredMonthlyMinor: number | null;
    completionMonth: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SavingsContributionView {
  id: string;
  savingsGoalId: string;
  amount: string;
  amountMinor: number;
  currency: string;
  note: string | null;
  createdAt: string;
}

function minorToDecimal(minor: number, digits = 2): string {
  return (minor / 10 ** digits).toFixed(digits);
}

function formatMoney(minor: number, _currency: string): string {
  return minorToDecimal(minor);
}

function userTxToView(tx: TransactionRecord): TransactionView {
  return {
    id: tx.id,
    type: tx.type,
    amount: formatMoney(tx.amountMinor, tx.currency),
    amountMinor: tx.amountMinor,
    currency: tx.currency,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    description: tx.description,
    notes: tx.notes,
    date: tx.date,
    transferId: tx.transferId,
    reversalOfId: tx.reversalOfId,
    reversedAt: tx.reversedAt,
    createdAt: tx.createdAt,
  };
}

async function getAccountBalance(accountId: string): Promise<{ balanceMinor: number; currency: string }> {
  const account = await db.accounts.get(accountId);
  if (!account) return { balanceMinor: 0, currency: "EGP" };

      const txs = await db.transactions
        .where("accountId")
        .equals(accountId)
        .toArray();

      let balance = account.openingBalanceMinor;
      for (const tx of txs) {
        if (tx.reversalOfId) continue;
        if (tx.type === "income") balance += tx.amountMinor;
        else if (tx.type === "expense") balance -= tx.amountMinor;
        else if (tx.type === "transfer") {
          const transfer = await db.transfers.get(tx.transferId!);
          if (transfer && transfer.fromAccountId === accountId && !transfer.reversedAt) {
            balance -= tx.amountMinor;
          } else if (transfer && transfer.toAccountId === accountId && !transfer.reversedAt) {
            balance += tx.amountMinor;
          }
        }
      }

  return { balanceMinor: balance, currency: account.currency };
}

/**
 * Upserts the local profile row for the active user and seeds the default
 * category set for them. Keeps Dexie in step with the signed-in identity.
 */
async function ensureUserProfile(user: PublicUser): Promise<UserRecord> {
  const existing = await db.users.get(user.id);
  const record: UserRecord = {
    id: user.id,
    name: user.name,
    email: user.email,
    defaultCurrency: user.defaultCurrency,
    locale: user.locale,
    createdAt: existing?.createdAt ?? user.createdAt,
  };
  await db.users.put(record);
  return record;
}

async function ensureDefaultCategories(userId = currentUserId()): Promise<void> {
  const existing = await db.categories.where("userId").equals(userId).count();
  if (existing > 0) return;

  const defaults: CategoryRecord[] = [
    { id: uid(), userId, name: "Food & Dining", type: "expense", parentId: null, icon: null, color: null, sortOrder: 0, system: true, isArchived: false },
    { id: uid(), userId, name: "Transport", type: "expense", parentId: null, icon: null, color: null, sortOrder: 1, system: true, isArchived: false },
    { id: uid(), userId, name: "Shopping", type: "expense", parentId: null, icon: null, color: null, sortOrder: 2, system: true, isArchived: false },
    { id: uid(), userId, name: "Bills & Utilities", type: "expense", parentId: null, icon: null, color: null, sortOrder: 3, system: true, isArchived: false },
    { id: uid(), userId, name: "Entertainment", type: "expense", parentId: null, icon: null, color: null, sortOrder: 4, system: true, isArchived: false },
    { id: uid(), userId, name: "Health", type: "expense", parentId: null, icon: null, color: null, sortOrder: 5, system: true, isArchived: false },
    { id: uid(), userId, name: "Education", type: "expense", parentId: null, icon: null, color: null, sortOrder: 6, system: true, isArchived: false },
    { id: uid(), userId, name: "Other", type: "both", parentId: null, icon: null, color: null, sortOrder: 7, system: true, isArchived: false },
    { id: uid(), userId, name: "Salary", type: "income", parentId: null, icon: null, color: null, sortOrder: 8, system: true, isArchived: false },
    { id: uid(), userId, name: "Freelance", type: "income", parentId: null, icon: null, color: null, sortOrder: 9, system: true, isArchived: false },
    { id: uid(), userId, name: "Investment Returns", type: "income", parentId: null, icon: null, color: null, sortOrder: 10, system: true, isArchived: false },
    { id: uid(), userId, name: "Other Income", type: "income", parentId: null, icon: null, color: null, sortOrder: 11, system: true, isArchived: false },
  ];

  await db.categories.bulkPut(defaults);
}

/** Extracts the `token` query parameter from a reset URL. */
function extractToken(url: string): string | null {
  const match = /[?&]token=([^&]+)/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Normalises the backend error envelope into a readable message. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body?.error === "string") return body.error;
    if (body?.error && typeof body.error.message === "string") return body.error.message;
  } catch {
    // not JSON
  }
  return response.status === 429 ? "Too many attempts" : "Request failed";
}

/**
 * Rotates the refresh token. Returns true when a new access token was stored.
 * Used transparently by `me()` when the access token has expired.
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken || refreshToken === "local") return false;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { tokens: TokenPair };
    if (!data?.tokens?.accessToken) return false;
    setTokens(data.tokens.accessToken, data.tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/** Creates/persists the local profile + default categories for a signed-in user. */
async function activateUser(user: PublicUser, offline: boolean): Promise<PublicUser> {
  setActiveUserId(user.id);
  await ensureUserProfile(user);
  await ensureDefaultCategories(user.id);
  saveCachedSession({
    id: user.id,
    email: user.email,
    name: user.name,
    defaultCurrency: user.defaultCurrency,
    locale: user.locale,
    createdAt: user.createdAt,
    offline,
  });
  return user;
}

/**
 * True when a response actually came from the JSON API. Static hosts such as
 * GitHub Pages answer unknown `/api/*` paths with an HTML page, which must be
 * treated as "backend not reachable" rather than a real auth rejection.
 */
function isApiResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export const api = {
  auth: {
    /**
     * Creates an account. Talks to the backend when it is reachable and falls
     * back to a device-local account when it is not (offline-first).
     */
    signup: async (body: { email: string; password: string; name: string }) => {
      const email = body.email.trim().toLowerCase();
      let response: Response | null = null;
      let networkFailure = false;
      try {
        response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: body.password, name: body.name }),
        });
      } catch {
        networkFailure = true;
      }

      // Static hosts (GitHub Pages) answer /api with an HTML 404 rather than
      // failing the request. Treat "no JSON API" as no backend so the user can
      // still start immediately instead of hitting a wall.
      if (response && !response.ok) {
        const looksLikeApi = isApiResponse(response);
        if (!looksLikeApi) {
          networkFailure = true;
          response = null;
        }
      }

      if (response && response.ok) {
        const data = (await response.json()) as { user: PublicUser; tokens: TokenPair };
        setTokens(data.tokens.accessToken, data.tokens.refreshToken);
        const user = await activateUser(data.user, false);
        return { user, tokens: data.tokens };
      }

      if (response && response.status === 409) {
        throw new ApiError("An account with this email already exists", 409, "EMAIL_TAKEN");
      }
      if (response && !response.ok) {
        const message = await readErrorMessage(response);
        throw new ApiError(message, response.status, "SIGNUP_FAILED");
      }

      if (!networkFailure) {
        throw new ApiError("Sign up failed", 500, "SIGNUP_FAILED");
      }

      // Offline: create a device-local account so the user can start immediately.
      const offlineId = `local-${uid()}`;
      const user: PublicUser = {
        id: offlineId,
        email,
        name: body.name,
        defaultCurrency: "EGP",
        locale: "en",
        createdAt: new Date().toISOString(),
      };
      const tokens: TokenPair = { accessToken: "local", refreshToken: "local", refreshExpiresAt: Date.now() + 86400000 };
      setTokens(tokens.accessToken, tokens.refreshToken);
      await activateUser(user, true);
      return { user, tokens };
    },

    /**
     * Signs in. Verifies against the backend when reachable; otherwise falls
     * back to the device-local profile previously used with this email.
     */
    login: async (body: { email: string; password: string }) => {
      const email = body.email.trim().toLowerCase();
      let response: Response | null = null;
      try {
        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: body.password }),
        });
      } catch {
        response = null;
      }

      // A static host answers /api with HTML, not JSON: that is a missing
      // backend, not a rejected password.
      if (response && !response.ok && !isApiResponse(response)) {
        response = null;
      }

      if (response && response.ok) {
        const data = (await response.json()) as { user: PublicUser; tokens: TokenPair };
        setTokens(data.tokens.accessToken, data.tokens.refreshToken);
        const user = await activateUser(data.user, false);
        return { user, tokens: data.tokens };
      }

      if (response && (response.status === 401 || response.status === 400)) {
        throw new ApiError("Incorrect email or password", 401, "INVALID_CREDENTIALS");
      }
      if (response && !response.ok) {
        const message = await readErrorMessage(response);
        throw new ApiError(message, response.status, "LOGIN_FAILED");
      }

      // Offline: allow the device-local account for this email.
      const cached = loadCachedSession();
      const local = await db.users.filter((record) => record.email === email).first();
      if ((cached && cached.email === email) || local) {
        const source = local ?? (cached as unknown as UserRecord);
        const user: PublicUser = {
          id: source.id,
          email: source.email,
          name: source.name,
          defaultCurrency: source.defaultCurrency,
          locale: source.locale,
          createdAt: source.createdAt,
        };
        const tokens: TokenPair = { accessToken: "local", refreshToken: "local", refreshExpiresAt: Date.now() + 86400000 };
        setTokens(tokens.accessToken, tokens.refreshToken);
        await activateUser(user, true);
        return { user, tokens };
      }

      throw new ApiError(
        "Cannot reach the server. Sign in once online to enable offline access.",
        0,
        "NETWORK_ERROR",
      );
    },

    logout: async () => {
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      if (token && token !== "local" && refreshToken) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ refreshToken }),
          });
        } catch {
          // ignore network errors on logout â€” local session is cleared regardless
        }
      }
      clearTokens();
      clearCachedSession();
      setActiveUserId(null);
    },

    /** Requests a reset link. Returns the dev link when the backend provides one. */
    forgotPassword: async (email: string) => {
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; devResetUrl?: string };
          const token = data.devResetUrl ? extractToken(data.devResetUrl) : null;
          return { ok: true as const, resetToken: token };
        }
        if (res.status === 429) {
          throw new ApiError("Too many attempts", 429, "RATE_LIMITED");
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // Backend unreachable â€” nothing to do but tell the user.
        throw new ApiError("Cannot reach the server", 0, "NETWORK_ERROR");
      }
      // The backend intentionally answers 200 for unknown emails (no enumeration).
      return { ok: true as const, resetToken: null };
    },

    resetPassword: async (token: string, password: string) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        return { ok: true as const };
      }
      if (res.status === 400) {
        throw new ApiError("Invalid or expired reset link", 400, "INVALID_RESET_TOKEN");
      }
      throw new ApiError(await readErrorMessage(res), res.status, "RESET_FAILED");
    },

    /**
     * Returns the signed-in user. Prefers the backend (authoritative) and
     * falls back to the cached device session when offline.
     */
    me: async (): Promise<PublicUser> => {
      const token = getAccessToken();
      if (token && token !== "local") {
        try {
          let res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
              res = await fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
              });
            }
          }
          if (res.ok && isApiResponse(res)) {
            const user = (await res.json()) as PublicUser;
            await activateUser(user, false);
            return user;
          }
        } catch {
          // fall through to the cached session
        }
      }

      const cached = loadCachedSession();
      if (cached) {
        const user: PublicUser = {
          id: cached.id,
          email: cached.email,
          name: cached.name,
          defaultCurrency: cached.defaultCurrency,
          locale: cached.locale,
          createdAt: cached.createdAt,
        };
        await activateUser(user, true);
        return user;
      }

      throw new ApiError("Not signed in", 401, "UNAUTHENTICATED");
    },

    updateMe: async (body: { name?: string; defaultCurrency?: string }) => {
      const id = currentUserId();
      const existing = await db.users.get(id);
      const token = getAccessToken();

      if (token && token !== "local") {
        try {
          const res = await fetch("/api/auth/me", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });
          if (res.ok && isApiResponse(res)) {
            const user = (await res.json()) as PublicUser;
            await activateUser(user, false);
            return user;
          }
        } catch {
          // offline — apply locally below
        }
      }

      if (!existing) {
        throw new ApiError("Not signed in", 401, "UNAUTHENTICATED");
      }
      if (body.name !== undefined) existing.name = body.name;
      if (body.defaultCurrency !== undefined) existing.defaultCurrency = body.defaultCurrency;
      await db.users.put(existing);
      saveCachedSession({ ...existing, offline: true });
      return existing as PublicUser;
    },

    /** Device-local profile for the active user (used by settings/onboarding). */
    currentProfile: async (): Promise<UserRecord | null> => (await db.users.get(currentUserId())) ?? null,
  },

  accounts: {
    list: async (): Promise<AccountView[]> => {
      const records = await db.accounts.where("userId").equals(currentUserId()).toArray();
      const views: AccountView[] = [];
      for (const r of records) {
        const { balanceMinor } = await getAccountBalance(r.id);
        views.push({
          id: r.id,
          name: r.name,
          type: r.type,
          currency: r.currency,
          balance: minorToDecimal(balanceMinor),
          balanceMinor,
          isActive: r.isActive,
          createdAt: r.createdAt,
        });
      }
      return views;
    },

    create: async (body: { name: string; type: string; currency: string; openingBalance: string }): Promise<AccountView> => {
      const openingBalanceMinor = parseAmountToMinor(body.openingBalance || "0", body.currency ?? "EGP");
      const record: AccountRecord = {
        id: uid(),
        userId: currentUserId(),
        name: body.name,
        type: body.type,
        currency: body.currency,
        openingBalanceMinor,
        isActive: true,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      await db.accounts.put(record);
      void queueSync("account", "CREATE", record.id, record);
      return {
        id: record.id,
        name: record.name,
        type: record.type,
        currency: record.currency,
        balance: minorToDecimal(openingBalanceMinor),
        balanceMinor: openingBalanceMinor,
        isActive: record.isActive,
        createdAt: record.createdAt,
      };
    },

    update: async (id: string, body: { name?: string; type?: string }): Promise<AccountView> => {
      const record = await db.accounts.get(id);
      if (!record) throw new ApiError("Account not found", 404, "NOT_FOUND");
      if (body.name !== undefined) record.name = body.name;
      if (body.type !== undefined) record.type = body.type;
      await db.accounts.put(record);
      void queueSync("account", "UPDATE", record.id, record);
      const { balanceMinor } = await getAccountBalance(id);
      return {
        id: record.id,
        name: record.name,
        type: record.type,
        currency: record.currency,
        balance: minorToDecimal(balanceMinor),
        balanceMinor,
        isActive: record.isActive,
        createdAt: record.createdAt,
      };
    },

    archive: async (id: string): Promise<AccountView> => {
      const record = await db.accounts.get(id);
      if (!record) throw new ApiError("Account not found", 404, "NOT_FOUND");
      record.isActive = false;
      await db.accounts.put(record);
      void queueSync("account", "UPDATE", record.id, record);
      const { balanceMinor } = await getAccountBalance(id);
      return {
        id: record.id,
        name: record.name,
        type: record.type,
        currency: record.currency,
        balance: minorToDecimal(balanceMinor),
        balanceMinor,
        isActive: false,
        createdAt: record.createdAt,
      };
    },

    activate: async (id: string): Promise<AccountView> => {
      const record = await db.accounts.get(id);
      if (!record) throw new ApiError("Account not found", 404, "NOT_FOUND");
      record.isActive = true;
      await db.accounts.put(record);
      void queueSync("account", "UPDATE", record.id, record);
      const { balanceMinor } = await getAccountBalance(id);
      return {
        id: record.id,
        name: record.name,
        type: record.type,
        currency: record.currency,
        balance: minorToDecimal(balanceMinor),
        balanceMinor,
        isActive: true,
        createdAt: record.createdAt,
      };
    },
  },

  categories: {
    list: async (): Promise<CategoryView[]> => {
      await ensureDefaultCategories();
      const records = await db.categories.where("userId").equals(currentUserId()).sortBy("sortOrder");
      return records.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as "income" | "expense" | "both",
        parentId: r.parentId,
        icon: r.icon,
        color: r.color,
        system: r.system,
        isArchived: r.isArchived,
      }));
    },

    create: async (body: { name: string; type: string }): Promise<CategoryView> => {
      const maxSort = await db.categories
        .where("userId")
        .equals(currentUserId())
        .toArray()
        .then((cats) => Math.max(0, ...cats.map((c) => c.sortOrder)));

      const record: CategoryRecord = {
        id: uid(),
        userId: currentUserId(),
        name: body.name,
        type: body.type,
        parentId: null,
        icon: null,
        color: null,
        sortOrder: maxSort + 1,
        system: false,
        isArchived: false,
      };
      await db.categories.put(record);
      void queueSync("category", "CREATE", record.id, record);
      return {
        id: record.id,
        name: record.name,
        type: record.type as "income" | "expense" | "both",
        parentId: record.parentId,
        icon: record.icon,
        color: record.color,
        system: false,
        isArchived: false,
      };
    },

    update: async (id: string, body: { name?: string; icon?: string | null; color?: string | null }): Promise<CategoryView> => {
      const record = await db.categories.get(id);
      if (!record) throw new ApiError("Category not found", 404, "NOT_FOUND");
      if (body.name !== undefined) record.name = body.name;
      if (body.icon !== undefined) record.icon = body.icon;
      if (body.color !== undefined) record.color = body.color;
      await db.categories.put(record);
      void queueSync("category", "UPDATE", record.id, record);
      return {
        id: record.id,
        name: record.name,
        type: record.type as "income" | "expense" | "both",
        parentId: record.parentId,
        icon: record.icon,
        color: record.color,
        system: record.system,
        isArchived: record.isArchived,
      };
    },

    archive: async (id: string): Promise<CategoryView> => {
      const record = await db.categories.get(id);
      if (!record) throw new ApiError("Category not found", 404, "NOT_FOUND");
      record.isArchived = true;
      await db.categories.put(record);
      void queueSync("category", "UPDATE", record.id, record);
      return {
        id: record.id,
        name: record.name,
        type: record.type as "income" | "expense" | "both",
        parentId: record.parentId,
        icon: record.icon,
        color: record.color,
        system: record.system,
        isArchived: true,
      };
    },
  },

  transactions: {
    list: async (query: { page?: number; limit?: number; sort?: string }): Promise<Paginated<TransactionView>> => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 30;

      const all = await db.transactions
        .where("userId")
        .equals(currentUserId())
        .reverse()
        .sortBy("date");

      const total = all.length;
      const start = (page - 1) * limit;
      const slice = all.slice(start, start + limit);

      const data: TransactionView[] = [];
      for (const tx of slice) {
        const account = await db.accounts.get(tx.accountId);
        data.push({
          ...userTxToView(tx),
          description: tx.description ?? account?.name ?? null,
        });
      }

      return { data, meta: { page, limit, total } };
    },

    create: async (body: {
      type: "income" | "expense";
      amount: string;
      accountId: string;
      categoryId: string;
      date: string;
      description?: string;
      notes?: string;
    }): Promise<TransactionView> => {
      const account = await db.accounts.get(body.accountId);
      if (!account) throw new ApiError("Account not found", 404, "NOT_FOUND");

      const amountMinor = parseAmountToMinor(body.amount, account.currency);
      const tx: TransactionRecord = {
        id: uid(),
        userId: currentUserId(),
        accountId: body.accountId,
        categoryId: body.categoryId,
        type: body.type,
        amountMinor,
        currency: account.currency,
        date: body.date,
        description: body.description ?? null,
        notes: body.notes ?? null,
        reversalOfId: null,
        reversedAt: null,
        transferId: null,
        createdAt: new Date().toISOString(),
      };
      await db.transactions.put(tx);
      void queueSync("transaction", "CREATE", tx.id, tx);
      return userTxToView(tx);
    },

    reverse: async (id: string): Promise<TransactionView> => {
      const tx = await db.transactions.get(id);
      if (!tx) throw new ApiError("Transaction not found", 404, "NOT_FOUND");
      if (tx.reversalOfId) throw new ApiError("Already reversed", 400, "ALREADY_REVERSED");

      const now = new Date().toISOString();
      tx.reversedAt = now;
      await db.transactions.put(tx);
      void queueSync("transaction", "UPDATE", tx.id, tx);

      const reversal: TransactionRecord = {
        ...tx,
        id: uid(),
        type: tx.type,
        amountMinor: tx.amountMinor,
        reversalOfId: tx.id,
        reversedAt: null,
        createdAt: now,
      };
      await db.transactions.put(reversal);
      void queueSync("transaction", "CREATE", reversal.id, reversal);
      return userTxToView(reversal);
    },
  },

  transfers: {
    list: async (query: { page?: number; limit?: number }): Promise<Paginated<TransferView>> => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 30;

      const all = await db.transfers
        .where("userId")
        .equals(currentUserId())
        .reverse()
        .sortBy("date");

      const total = all.length;
      const start = (page - 1) * limit;
      const slice = all.slice(start, start + limit);

      const data: TransferView[] = [];
      for (const tr of slice) {
        const legs = await db.transactions
          .where("transferId")
          .equals(tr.id)
          .toArray();

        const fromAccount = await db.accounts.get(tr.fromAccountId);
        const toAccount = await db.accounts.get(tr.toAccountId);

        data.push({
          id: tr.id,
          fromAccountId: tr.fromAccountId,
          toAccountId: tr.toAccountId,
          amount: minorToDecimal(tr.amountMinor),
          amountMinor: tr.amountMinor,
          currency: tr.currency,
          notes: tr.notes,
          date: tr.date,
          reversedAt: tr.reversedAt,
          createdAt: tr.createdAt,
          legs: legs.map((leg) => ({
            ...userTxToView(leg),
            description: (leg.accountId === tr.fromAccountId ? fromAccount?.name : toAccount?.name) ?? null,
          })),
        });
      }

      return { data, meta: { page, limit, total } };
    },

    create: async (body: { fromAccountId: string; toAccountId: string; amount: string; date: string; notes?: string }) => {
      if (body.fromAccountId === body.toAccountId) {
        throw new ApiError("Cannot transfer to same account", 400, "SAME_ACCOUNT");
      }

      const fromAccount = await db.accounts.get(body.fromAccountId);
      const toAccount = await db.accounts.get(body.toAccountId);
      if (!fromAccount || !toAccount) throw new ApiError("Account not found", 404, "NOT_FOUND");

      const amountMinor = parseAmountToMinor(body.amount, fromAccount.currency);
      const transferId = uid();

      const transfer: TransferRecord = {
        id: transferId,
        userId: currentUserId(),
        fromAccountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        amountMinor,
        currency: fromAccount.currency,
        date: body.date,
        notes: body.notes ?? null,
        reversedAt: null,
        createdAt: new Date().toISOString(),
      };
      await db.transfers.put(transfer);
      void queueSync("transfer", "CREATE", transfer.id, transfer);

      const legOut: TransactionRecord = {
        id: uid(),
        userId: currentUserId(),
        accountId: body.fromAccountId,
        categoryId: null,
        type: "transfer",
        amountMinor,
        currency: fromAccount.currency,
        date: body.date,
        description: fromAccount.name,
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId,
        createdAt: transfer.createdAt,
      };

      const legIn: TransactionRecord = {
        id: uid(),
        userId: currentUserId(),
        accountId: body.toAccountId,
        categoryId: null,
        type: "transfer",
        amountMinor,
        currency: toAccount.currency,
        date: body.date,
        description: toAccount.name,
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId,
        createdAt: transfer.createdAt,
      };

      await db.transactions.bulkPut([legOut, legIn]);
      void queueSync("transaction", "CREATE", legOut.id, legOut);
      void queueSync("transaction", "CREATE", legIn.id, legIn);
      return { ok: true };
    },

    reverse: async (id: string) => {
      const transfer = await db.transfers.get(id);
      if (!transfer) throw new ApiError("Transfer not found", 404, "NOT_FOUND");

      transfer.reversedAt = new Date().toISOString();
      await db.transfers.put(transfer);
      void queueSync("transfer", "UPDATE", transfer.id, transfer);

      const legs = await db.transactions.where("transferId").equals(id).toArray();
      for (const leg of legs) {
        await db.transactions.put(leg);
        void queueSync("transaction", "UPDATE", leg.id, leg);
      }

      return { ok: true };
    },
  },

  dashboard: {
    get: async (query: { month?: string; currency?: string }): Promise<DashboardView> => {
      const user = await db.users.get(currentUserId());
      const defaultCurrency = query.currency ?? user?.defaultCurrency ?? "EGP";
      const month = query.month ?? (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      })();

      const allTxs = await db.transactions.where("userId").equals(currentUserId()).toArray();
      const monthTxs = allTxs.filter((tx) => tx.date.startsWith(month));

      let incomeMinor = 0;
      let expensesMinor = 0;
      const categorySpending: Record<string, number> = {};

      for (const tx of monthTxs) {
        if (tx.reversalOfId) continue;
        if (tx.type === "income") incomeMinor += tx.amountMinor;
        else if (tx.type === "expense") {
          expensesMinor += tx.amountMinor;
          const catId = tx.categoryId ?? "uncategorized";
          categorySpending[catId] = (categorySpending[catId] ?? 0) + tx.amountMinor;
        }
      }

      const savingsMinor = incomeMinor - expensesMinor;
      const savingsRatePercent = incomeMinor > 0 ? Math.round((savingsMinor / incomeMinor) * 100) : null;

      const categories = await db.categories.where("userId").equals(currentUserId()).toArray();
      const categoryMap = new Map(categories.map((c) => [c.id, c]));

      const spendingByCategory = Object.entries(categorySpending)
        .map(([catId, amountMinor]) => {
          const cat = categoryMap.get(catId);
          return {
            categoryId: catId === "uncategorized" ? null : catId,
            categoryName: cat?.name ?? "Uncategorized",
            icon: cat?.icon ?? null,
            color: cat?.color ?? null,
            amountMinor,
            percentOfTotal: expensesMinor > 0 ? Math.round((amountMinor / expensesMinor) * 100) : 0,
          };
        })
        .sort((a, b) => b.amountMinor - a.amountMinor);

      const accounts = await db.accounts.where("userId").equals(currentUserId()).toArray();
      const accountBalances: { accountId: string; name: string; currency: string; balanceMinor: number }[] = [];
      const balancesByCurrency: Record<string, number> = {};

      for (const acc of accounts) {
        if (!acc.isActive) continue;
        const { balanceMinor } = await getAccountBalance(acc.id);
        accountBalances.push({ accountId: acc.id, name: acc.name, currency: acc.currency, balanceMinor });
        balancesByCurrency[acc.currency] = (balancesByCurrency[acc.currency] ?? 0) + balanceMinor;
      }

      const balances = Object.entries(balancesByCurrency).map(([currency, amountMinor]) => ({ currency, amountMinor }));
      const totalBalanceMinor = balances.reduce((sum, b) => sum + b.amountMinor, 0);

      const months = new Set<string>();
      for (const tx of allTxs) {
        months.add(tx.date.slice(0, 7));
      }
      const sortedMonths = [...months].sort().slice(-6);

      const trend = sortedMonths.map((m) => {
        const mTxs = allTxs.filter((tx) => tx.date.startsWith(m) && !tx.reversalOfId);
        return {
          month: m,
          incomeMinor: mTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amountMinor, 0),
          expensesMinor: mTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amountMinor, 0),
        };
      });

      const recentTxs = monthTxs
        .filter((tx) => !tx.reversalOfId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
        .map((tx) => {
          const acc = accounts.find((a) => a.id === tx.accountId);
          return { ...userTxToView(tx), description: tx.description ?? acc?.name ?? null };
        });

      return {
        month,
        currency: defaultCurrency,
        balances,
        totalBalanceMinor,
        monthSummary: { incomeMinor, expensesMinor, savingsMinor, savingsRatePercent },
        spendingByCategory,
        trend,
        recentTransactions: recentTxs,
        accountBalances,
      };
    },
  },

  budgets: {
    list: async (query: { period?: string; includeArchived?: boolean }): Promise<BudgetView[]> => {
      const period = query.period ?? (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      })();

      let records = await db.budgets
        .where("userId")
        .equals(currentUserId())
        .toArray();

      if (!query.includeArchived) {
        records = records.filter((r) => !r.isArchived);
      }

      const categories = await db.categories.where("userId").equals(currentUserId()).toArray();
      const categoryMap = new Map(categories.map((c) => [c.id, c]));

      const allTxs = await db.transactions.where("userId").equals(currentUserId()).toArray();
      const monthTxs = allTxs.filter((tx) => tx.date.startsWith(period) && tx.type === "expense" && !tx.reversalOfId);

      const views: BudgetView[] = [];
      for (const r of records) {
        const cat = categoryMap.get(r.categoryId);
        const spentMinor = monthTxs
          .filter((tx) => tx.categoryId === r.categoryId)
          .reduce((sum, tx) => sum + tx.amountMinor, 0);

        const remainingMinor = r.amountMinor - spentMinor;
        const percentUsed = r.amountMinor > 0 ? Math.round((spentMinor / r.amountMinor) * 100) : 0;
        let status: BudgetStatus = "normal";
        if (percentUsed >= 100) status = "exceeded";
        else if (percentUsed >= r.warningThresholdPercent) status = "approaching";

        views.push({
          id: r.id,
          categoryId: r.categoryId,
          categoryName: cat?.name ?? "Unknown",
          icon: cat?.icon ?? null,
          color: cat?.color ?? null,
          period: r.period,
          amount: minorToDecimal(r.amountMinor),
          amountMinor: r.amountMinor,
          currency: r.currency,
          spent: minorToDecimal(spentMinor),
          spentMinor,
          remaining: minorToDecimal(Math.max(0, remainingMinor)),
          remainingMinor: Math.max(0, remainingMinor),
          percentUsed,
          status,
          warningThresholdPercent: r.warningThresholdPercent,
          isArchived: r.isArchived,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      }

      return views;
    },

    create: async (body: { categoryId: string; amount: string; currency: string; period: string; warningThresholdPercent?: number }): Promise<BudgetView> => {
      const amountMinor = parseAmountToMinor(body.amount, body.currency);
      const record: BudgetRecord = {
        id: uid(),
        userId: currentUserId(),
        categoryId: body.categoryId,
        amountMinor,
        currency: body.currency,
        period: body.period,
        warningThresholdPercent: body.warningThresholdPercent ?? 75,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.budgets.put(record);
      void queueSync("budget", "CREATE", record.id, record);

      const cat = await db.categories.get(body.categoryId);
      return {
        id: record.id,
        categoryId: record.categoryId,
        categoryName: cat?.name ?? "Unknown",
        icon: cat?.icon ?? null,
        color: cat?.color ?? null,
        period: record.period,
        amount: minorToDecimal(record.amountMinor),
        amountMinor: record.amountMinor,
        currency: record.currency,
        spent: "0.00",
        spentMinor: 0,
        remaining: minorToDecimal(record.amountMinor),
        remainingMinor: record.amountMinor,
        percentUsed: 0,
        status: "normal",
        warningThresholdPercent: record.warningThresholdPercent,
        isArchived: false,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    update: async (id: string, body: Record<string, unknown>): Promise<BudgetView> => {
      const record = await db.budgets.get(id);
      if (!record) throw new ApiError("Budget not found", 404, "NOT_FOUND");

      if (typeof body.amount === "string") record.amountMinor = parseAmountToMinor(body.amount, record.currency);
      if (typeof body.warningThresholdPercent === "number") record.warningThresholdPercent = body.warningThresholdPercent;
      record.updatedAt = new Date().toISOString();

      await db.budgets.put(record);
      void queueSync("budget", "UPDATE", record.id, record);

      const cat = await db.categories.get(record.categoryId);
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthTxs = await db.transactions
        .where("userId")
        .equals(currentUserId())
        .and((tx) => tx.date.startsWith(month) && tx.type === "expense" && !tx.reversalOfId)
        .toArray();

      const spentMinor = monthTxs
        .filter((tx) => tx.categoryId === record.categoryId)
        .reduce((sum, tx) => sum + tx.amountMinor, 0);

      const remainingMinor = record.amountMinor - spentMinor;
      const percentUsed = record.amountMinor > 0 ? Math.round((spentMinor / record.amountMinor) * 100) : 0;
      let status: BudgetStatus = "normal";
      if (percentUsed >= 100) status = "exceeded";
      else if (percentUsed >= record.warningThresholdPercent) status = "approaching";

      return {
        id: record.id,
        categoryId: record.categoryId,
        categoryName: cat?.name ?? "Unknown",
        icon: cat?.icon ?? null,
        color: cat?.color ?? null,
        period: record.period,
        amount: minorToDecimal(record.amountMinor),
        amountMinor: record.amountMinor,
        currency: record.currency,
        spent: minorToDecimal(spentMinor),
        spentMinor,
        remaining: minorToDecimal(Math.max(0, remainingMinor)),
        remainingMinor: Math.max(0, remainingMinor),
        percentUsed,
        status,
        warningThresholdPercent: record.warningThresholdPercent,
        isArchived: record.isArchived,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    archive: async (id: string): Promise<BudgetView> => {
      const record = await db.budgets.get(id);
      if (!record) throw new ApiError("Budget not found", 404, "NOT_FOUND");
      record.isArchived = true;
      record.updatedAt = new Date().toISOString();
      await db.budgets.put(record);
      void queueSync("budget", "UPDATE", record.id, record);

      const cat = await db.categories.get(record.categoryId);
      return {
        id: record.id,
        categoryId: record.categoryId,
        categoryName: cat?.name ?? "Unknown",
        icon: cat?.icon ?? null,
        color: cat?.color ?? null,
        period: record.period,
        amount: minorToDecimal(record.amountMinor),
        amountMinor: record.amountMinor,
        currency: record.currency,
        spent: "0.00",
        spentMinor: 0,
        remaining: minorToDecimal(record.amountMinor),
        remainingMinor: record.amountMinor,
        percentUsed: 0,
        status: "normal",
        warningThresholdPercent: record.warningThresholdPercent,
        isArchived: true,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },
  },

  savingsGoals: {
    list: async (query: { includeArchived?: boolean }): Promise<SavingsGoalView[]> => {
      let records = await db.savingsGoals.where("userId").equals(currentUserId()).toArray();
      if (!query.includeArchived) {
        records = records.filter((r) => !r.isArchived);
      }

      const views: SavingsGoalView[] = [];
      for (const r of records) {
        const progressPercent = r.targetAmountMinor > 0 ? Math.min(100, Math.round((r.currentMinor / r.targetAmountMinor) * 100)) : 0;
        const achieved = r.currentMinor >= r.targetAmountMinor && r.targetAmountMinor > 0;
        const remainingMinor = Math.max(0, r.targetAmountMinor - r.currentMinor);

        let requiredMonthlyMinor: number | null = null;
        let completionMonth: string | null = null;
        if (r.targetDate && !achieved && r.currentMinor < r.targetAmountMinor) {
          const targetDate = new Date(r.targetDate);
          const now = new Date();
          const monthsLeft = Math.max(1, Math.round((targetDate.getTime() - now.getTime()) / (30.44 * 86400000)));
          requiredMonthlyMinor = Math.ceil(remainingMinor / monthsLeft);
          completionMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
        }

        views.push({
          id: r.id,
          name: r.name,
          targetAmount: minorToDecimal(r.targetAmountMinor),
          targetAmountMinor: r.targetAmountMinor,
          currentAmount: minorToDecimal(r.currentMinor),
          currentMinor: r.currentMinor,
          currency: r.currency,
          targetDate: r.targetDate,
          description: r.description,
          progressPercent,
          achieved,
          remainingAmount: minorToDecimal(remainingMinor),
          remainingMinor,
          isArchived: r.isArchived,
          estimates: {
            requiredMonthly: requiredMonthlyMinor !== null ? minorToDecimal(requiredMonthlyMinor) : null,
            requiredMonthlyMinor,
            completionMonth,
          },
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      }

      return views;
    },

    create: async (body: { name: string; targetAmount: string; currency: string; targetDate?: string | null; description?: string; currentAmount?: string }): Promise<SavingsGoalView> => {
      const targetAmountMinor = parseAmountToMinor(body.targetAmount, body.currency);
      const currentMinor = body.currentAmount ? parseAmountToMinor(body.currentAmount, body.currency) : 0;
      const now = new Date().toISOString();
      const record: SavingsGoalRecord = {
        id: uid(),
        userId: currentUserId(),
        name: body.name,
        currency: body.currency,
        targetAmountMinor,
        currentMinor,
        targetDate: body.targetDate ?? null,
        description: body.description ?? null,
        isArchived: false,
        achievedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.savingsGoals.put(record);
      void queueSync("savingsGoal", "CREATE", record.id, record);

      return {
        id: record.id,
        name: record.name,
        targetAmount: minorToDecimal(record.targetAmountMinor),
        targetAmountMinor: record.targetAmountMinor,
        currentAmount: minorToDecimal(record.currentMinor),
        currentMinor: record.currentMinor,
        currency: record.currency,
        targetDate: record.targetDate,
        description: record.description,
        progressPercent: record.targetAmountMinor > 0 ? Math.min(100, Math.round((record.currentMinor / record.targetAmountMinor) * 100)) : 0,
        achieved: record.currentMinor >= record.targetAmountMinor && record.targetAmountMinor > 0,
        remainingAmount: minorToDecimal(Math.max(0, record.targetAmountMinor - record.currentMinor)),
        remainingMinor: Math.max(0, record.targetAmountMinor - record.currentMinor),
        isArchived: false,
        estimates: { requiredMonthly: null, requiredMonthlyMinor: null, completionMonth: null },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    update: async (id: string, body: Record<string, unknown>): Promise<SavingsGoalView> => {
      const record = await db.savingsGoals.get(id);
      if (!record) throw new ApiError("Savings goal not found", 404, "NOT_FOUND");

      if (typeof body.name === "string") record.name = body.name;
      if (typeof body.targetAmount === "string") record.targetAmountMinor = parseAmountToMinor(body.targetAmount, record.currency);
      if (typeof body.targetDate === "string" || body.targetDate === null) record.targetDate = body.targetDate as string | null;
      if (typeof body.description === "string" || body.description === null) record.description = body.description as string | null;
      record.updatedAt = new Date().toISOString();

      await db.savingsGoals.put(record);
      void queueSync("savingsGoal", "UPDATE", record.id, record);

      const progressPercent = record.targetAmountMinor > 0 ? Math.min(100, Math.round((record.currentMinor / record.targetAmountMinor) * 100)) : 0;
      const achieved = record.currentMinor >= record.targetAmountMinor && record.targetAmountMinor > 0;
      const remainingMinor = Math.max(0, record.targetAmountMinor - record.currentMinor);

      return {
        id: record.id,
        name: record.name,
        targetAmount: minorToDecimal(record.targetAmountMinor),
        targetAmountMinor: record.targetAmountMinor,
        currentAmount: minorToDecimal(record.currentMinor),
        currentMinor: record.currentMinor,
        currency: record.currency,
        targetDate: record.targetDate,
        description: record.description,
        progressPercent,
        achieved,
        remainingAmount: minorToDecimal(remainingMinor),
        remainingMinor,
        isArchived: record.isArchived,
        estimates: { requiredMonthly: null, requiredMonthlyMinor: null, completionMonth: null },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    archive: async (id: string): Promise<SavingsGoalView> => {
      const record = await db.savingsGoals.get(id);
      if (!record) throw new ApiError("Savings goal not found", 404, "NOT_FOUND");
      record.isArchived = true;
      record.updatedAt = new Date().toISOString();
      await db.savingsGoals.put(record);
      void queueSync("savingsGoal", "UPDATE", record.id, record);

      return {
        id: record.id,
        name: record.name,
        targetAmount: minorToDecimal(record.targetAmountMinor),
        targetAmountMinor: record.targetAmountMinor,
        currentAmount: minorToDecimal(record.currentMinor),
        currentMinor: record.currentMinor,
        currency: record.currency,
        targetDate: record.targetDate,
        description: record.description,
        progressPercent: 100,
        achieved: record.currentMinor >= record.targetAmountMinor,
        remainingAmount: "0.00",
        remainingMinor: 0,
        isArchived: true,
        estimates: { requiredMonthly: null, requiredMonthlyMinor: null, completionMonth: null },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    },

    contributions: {
      list: async (goalId: string): Promise<SavingsContributionView[]> => {
        const records = await db.savingsContributions
          .where("goalId")
          .equals(goalId)
          .reverse()
          .sortBy("createdAt");

        const goal = await db.savingsGoals.get(goalId);
        const currency = goal?.currency ?? "EGP";

        return records.map((r) => ({
          id: r.id,
          savingsGoalId: r.goalId,
          amount: minorToDecimal(r.amountMinor),
          amountMinor: r.amountMinor,
          currency,
          note: r.note,
          createdAt: r.createdAt,
        }));
      },

      add: async (goalId: string, body: { amount: string; note?: string }): Promise<SavingsGoalView> => {
        const goal = await db.savingsGoals.get(goalId);
        if (!goal) throw new ApiError("Savings goal not found", 404, "NOT_FOUND");

        const amountMinor = parseAmountToMinor(body.amount, goal.currency);

        const contribution: SavingsContributionRecord = {
          id: uid(),
          goalId,
          amountMinor,
          note: body.note ?? null,
          createdAt: new Date().toISOString(),
        };
        await db.savingsContributions.put(contribution);
        void queueSync("savingsContribution", "CREATE", contribution.id, contribution);

        goal.currentMinor += amountMinor;
        goal.updatedAt = new Date().toISOString();
        if (goal.currentMinor >= goal.targetAmountMinor && goal.targetAmountMinor > 0) {
          goal.achievedAt = goal.achievedAt ?? new Date().toISOString();
        }
        await db.savingsGoals.put(goal);
        void queueSync("savingsGoal", "UPDATE", goal.id, goal);

        const progressPercent = goal.targetAmountMinor > 0 ? Math.min(100, Math.round((goal.currentMinor / goal.targetAmountMinor) * 100)) : 0;
        const achieved = goal.currentMinor >= goal.targetAmountMinor && goal.targetAmountMinor > 0;
        const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentMinor);

        return {
          id: goal.id,
          name: goal.name,
          targetAmount: minorToDecimal(goal.targetAmountMinor),
          targetAmountMinor: goal.targetAmountMinor,
          currentAmount: minorToDecimal(goal.currentMinor),
          currentMinor: goal.currentMinor,
          currency: goal.currency,
          targetDate: goal.targetDate,
          description: goal.description,
          progressPercent,
          achieved,
          remainingAmount: minorToDecimal(remainingMinor),
          remainingMinor,
          isArchived: goal.isArchived,
          estimates: { requiredMonthly: null, requiredMonthlyMinor: null, completionMonth: null },
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
        };
      },
    },
  },
};
