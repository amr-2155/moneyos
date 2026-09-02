import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createId } from "../lib/id.js";

/**
 * MoneyOS database schema.
 *
 * Conventions:
 * - IDs: random URL-safe ids generated at insert time.
 * - Money: integer minor units (`*Minor`) with an explicit ISO 4217 `currency` text.
 * - Timestamps: integer epoch milliseconds.
 * - Ownership: every user-owned table carries `userId`; all queries scope by it.
 */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    defaultCurrency: text("default_currency").notNull().default("EGP"),
    locale: text("locale").notNull().default("en"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uq").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
  ],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_hash_idx").on(table.tokenHash),
  ],
);

export const accountTypes = ["cash", "bank", "mobile_wallet", "credit_card", "savings", "investment", "other"] as const;
export type AccountType = (typeof accountTypes)[number];

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    type: text("type", { enum: accountTypes }).notNull(),
    currency: text("currency").notNull(),
    openingBalanceMinor: integer("opening_balance_minor").notNull().default(0),
    note: text("note"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const categoryTypes = ["income", "expense", "both"] as const;
export type CategoryType = (typeof categoryTypes)[number];

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    /** `null` for system categories available to every user. */
    userId: text("user_id").references(() => users.id),
    /** Hierarchy parent. Foreign key is enforced at the application layer. */
    parentId: text("parent_id"),
    name: text("name").notNull(),
    type: text("type", { enum: categoryTypes }).notNull().default("expense"),
    icon: text("icon"),
    color: text("color"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("categories_user_id_idx").on(table.userId)],
);

export const transactionTypes = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    type: text("type", { enum: transactionTypes }).notNull(),
    /** Signed minor units: income > 0, expense < 0, transfer legs signed. */
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    categoryId: text("category_id").references(() => categories.id),
    description: text("description"),
    notes: text("notes"),
    /** User-facing date, `YYYY-MM-DD`. */
    date: text("date").notNull(),
    transferId: text("transfer_id").references(() => transactionTransfers.id),
    /** Set on the reversal entry, pointing to the original transaction. */
    reversalOfId: text("reversal_of_id"),
    /** Set on the original when a reversal exists. */
    reversedAt: integer("reversed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("transactions_user_date_idx").on(table.userId, table.date),
    index("transactions_user_account_idx").on(table.userId, table.accountId),
    index("transactions_user_category_idx").on(table.userId, table.categoryId),
  ],
);

export const transactionTransfers = sqliteTable(
  "transaction_transfers",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** Leg on the source account (negative amount). Logical link, no FK to avoid a circular reference. Null until the legs are inserted. */
    fromTransactionId: text("from_transaction_id"),
    /** Leg on the destination account (positive amount). */
    toTransactionId: text("to_transaction_id"),
    fromAccountId: text("from_account_id")
      .notNull()
      .references(() => accounts.id),
    toAccountId: text("to_account_id")
      .notNull()
      .references(() => accounts.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    notes: text("notes"),
    reversedAt: integer("reversed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("transaction_transfers_user_idx").on(table.userId)],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    /** `YYYY-MM` period. */
    period: text("period").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("EGP"),
    /** Spending is derived from transactions; this column is maintained for cheap reads. */
    spentMinor: integer("spent_minor").notNull().default(0),
    warningThresholdPercent: integer("warning_threshold_percent").notNull().default(80),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("budgets_user_category_period_uq").on(table.userId, table.categoryId, table.period),
    index("budgets_user_period_idx").on(table.userId, table.period),
  ],
);

export const savingsGoals = sqliteTable(
  "savings_goals",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    targetMinor: integer("target_minor").notNull(),
    currentMinor: integer("current_minor").notNull().default(0),
    currency: text("currency").notNull(),
    /** `YYYY-MM-DD`. */
    targetDate: text("target_date"),
    description: text("description"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("savings_goals_user_idx").on(table.userId)],
);

export const savingsContributions = sqliteTable(
  "savings_contributions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    savingsGoalId: text("savings_goal_id")
      .notNull()
      .references(() => savingsGoals.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("savings_contributions_goal_idx").on(table.savingsGoalId),
    index("savings_contributions_user_idx").on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type TransactionTransfer = typeof transactionTransfers.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type SavingsContribution = typeof savingsContributions.$inferSelect;

/** Idempotency keys for the sync endpoint — prevents duplicate processing. */
export const syncIdempotencyKeys = sqliteTable("sync_idempotency_keys", {
  operationId: text("operation_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
