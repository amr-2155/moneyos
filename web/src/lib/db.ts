import Dexie, { type Table } from "dexie";
import { currentUserId } from "./session";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  defaultCurrency: string;
  locale: string;
  createdAt: string;
}

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: string;
  currency: string;
  openingBalanceMinor: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  userId: string;
  name: string;
  type: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  system: boolean;
  isArchived: boolean;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  date: string;
  description: string | null;
  notes: string | null;
  reversalOfId: string | null;
  reversedAt: string | null;
  transferId: string | null;
  createdAt: string;
}

export interface TransferRecord {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  currency: string;
  date: string;
  notes: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface BudgetRecord {
  id: string;
  userId: string;
  categoryId: string;
  amountMinor: number;
  currency: string;
  period: string;
  warningThresholdPercent: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalRecord {
  id: string;
  userId: string;
  name: string;
  currency: string;
  targetAmountMinor: number;
  currentMinor: number;
  targetDate: string | null;
  description: string | null;
  isArchived: boolean;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsContributionRecord {
  id: string;
  goalId: string;
  amountMinor: number;
  note: string | null;
  createdAt: string;
}

/**
 * A scheduled bill or income. The rule itself holds no transactions; due
 * occurrences are materialised into real records so reporting stays truthful.
 */
export interface RecurringRuleRecord {
  id: string;
  userId: string;
  name: string;
  accountId: string;
  categoryId: string | null;
  type: "income" | "expense";
  amountMinor: number;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  /** Anchor date: the first due date, and the day every later occurrence aligns to. */
  startDate: string;
  endDate: string | null;
  remindDaysBefore: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A learned or hand-made rule mapping a word from the description to a
 * category, e.g. "كارفور" → Groceries. Patterns are stored already folded, so
 * matching does not have to re-normalise every keystroke.
 */
export interface CategoryRuleRecord {
  id: string;
  userId: string;
  pattern: string;
  categoryId: string;
  type: "expense" | "income" | "any";
  /** Times the user confirmed this rule by saving a matching transaction. */
  hits: number;
  source: "learned" | "user";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncOperation {
  operationId: string;
  entity: string;
  entityId: string;
  operation: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  status: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  nextRetryAt: string | null;
  lastError: string | null;
}

export interface SyncPayload {
  [key: string]: unknown;
}

export type SyncQueueTable = Table<SyncOperation, string>;

const DB_NAME = "moneyos";

export class MoneyOSDB extends Dexie {
  users!: Table<UserRecord>;
  accounts!: Table<AccountRecord>;
  categories!: Table<CategoryRecord>;
  transactions!: Table<TransactionRecord>;
  transfers!: Table<TransferRecord>;
  budgets!: Table<BudgetRecord>;
  savingsGoals!: Table<SavingsGoalRecord>;
  savingsContributions!: Table<SavingsContributionRecord>;
  syncQueue!: Table<SyncOperation, string>;
  recurringRules!: Table<RecurringRuleRecord>;
  categoryRules!: Table<CategoryRuleRecord>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      users: "id",
      accounts: "id, userId, [userId+type]",
      categories: "id, userId, [userId+type]",
      transactions: "id, userId, accountId, categoryId, date, [userId+date], [userId+accountId]",
      transfers: "id, userId, [userId+date]",
      budgets: "id, userId, [userId+period], [userId+categoryId]",
      savingsGoals: "id, userId",
      savingsContributions: "id, goalId",
    });
    this.version(2).stores({
      syncQueue: "operationId, status, [status+nextRetryAt], createdAt",
    });
    this.version(3).stores({
      recurringRules: "id, userId, [userId+startDate]",
    });
    this.version(4).stores({
      categoryRules: "id, userId, [userId+pattern], [userId+categoryId]",
    });
  }
}

export const db = new MoneyOSDB();

export function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Ownership key for local records: the id of the user signed in on this
 * device. Two accounts on the same device never see each other's data.
 */
export { currentUserId };

