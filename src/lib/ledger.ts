import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { accounts, categories, transactions } from "../db/schema.js";
import { divideRound } from "./money.js";

/**
 * Ledger helpers.
 *
 * Balance architecture: **calculated balances**. An account's balance is the
 * single source of truth derived from its transactions:
 *
 *   balance = openingBalanceMinor + SUM(amountMinor over the account's ledger)
 *
 * Signed convention: income > 0, expense < 0, transfer legs signed
 * (source negative, destination positive). Reversals are normal ledger rows
 * with flipped signs, so balances and category/type totals automatically
 * stay correct without any persisted balance bookkeeping.
 */

export interface AccountBalance {
  accountId: string;
  currency: string;
  openingBalanceMinor: number;
  balanceMinor: number;
}

export function computeAccountBalances(db: Db, userId: string): AccountBalance[] {
  const rows = db
    .select({
      accountId: accounts.id,
      currency: accounts.currency,
      openingBalanceMinor: accounts.openingBalanceMinor,
      delta: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(eq(transactions.accountId, accounts.id), eq(transactions.userId, userId)),
    )
    .where(eq(accounts.userId, userId))
    .groupBy(accounts.id)
    .all();

  return rows.map((row) => ({
    accountId: row.accountId,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    balanceMinor: row.openingBalanceMinor + row.delta,
  }));
}

export function computeAccountBalance(db: Db, userId: string, accountId: string): number {
  const row = db
    .select({
      openingBalanceMinor: accounts.openingBalanceMinor,
      delta: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .groupBy(accounts.id)
    .get();

  if (!row) {
    return 0;
  }
  return row.openingBalanceMinor + row.delta;
}

export interface TypeAndCurrencyTotals {
  type: string;
  currency: string;
  totalMinor: number;
}

/** Inclusive date range as `YYYY-MM-DD` strings. */
export interface DateRange {
  from?: string;
  to?: string;
}

/** Sums signed amountMinor grouped by (type, currency) for a date range. */
export function totalsByTypeAndCurrency(
  db: Db,
  userId: string,
  range?: DateRange,
): TypeAndCurrencyTotals[] {
  const conditions = [eq(transactions.userId, userId)];
  if (range?.from) {
    conditions.push(sql`${transactions.date} >= ${range.from}`);
  }
  if (range?.to) {
    conditions.push(sql`${transactions.date} <= ${range.to}`);
  }

  return db
    .select({
      type: transactions.type,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.type, transactions.currency)
    .all();
}

export interface MonthTypeCurrencyTotals {
  month: string;
  type: string;
  currency: string;
  totalMinor: number;
}

/**
 * Signed totals per `YYYY-MM`, transaction type, and currency for the given
 * month range (inclusive). Transfers are a separate type and therefore never
 * leak into income/expense. Reversal rows carry flipped signs, so sums net out.
 */
export function totalsByMonthTypeAndCurrency(
  db: Db,
  userId: string,
  range: { fromMonth: string; toMonth: string },
  currency?: string,
): MonthTypeCurrencyTotals[] {
  const conditions = [
    eq(transactions.userId, userId),
    sql`substr(${transactions.date}, 1, 7) >= ${range.fromMonth}`,
    sql`substr(${transactions.date}, 1, 7) <= ${range.toMonth}`,
  ];
  if (currency) {
    conditions.push(eq(transactions.currency, currency));
  }

  return db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      type: transactions.type,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type, transactions.currency)
    .all();
}

export interface CategoryExpenseTotal {
  categoryId: string | null;
  categoryName: string;
  icon: string | null;
  color: string | null;
  currency: string;
  totalMinor: number;
}

/**
 * Net expense totals grouped by category and currency for a date range.
 * Only `expense` transactions are summed; transfers are excluded by type and
 * reversals net out via flipped signs. `categoryId` is null for orphan rows,
 * surfaced as "Uncategorized".
 */
export function expenseTotalsByCategory(
  db: Db,
  userId: string,
  range?: DateRange,
  currency?: string,
): CategoryExpenseTotal[] {
  const conditions = [
    eq(transactions.userId, userId),
    eq(transactions.type, "expense"),
  ];
  if (range?.from) {
    conditions.push(sql`${transactions.date} >= ${range.from}`);
  }
  if (range?.to) {
    conditions.push(sql`${transactions.date} <= ${range.to}`);
  }
  if (currency) {
    conditions.push(eq(transactions.currency, currency));
  }

  return db
    .select({
      categoryId: transactions.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
      icon: categories.icon,
      color: categories.color,
      currency: transactions.currency,
      totalMinor: sql<number>`SUM(${transactions.amountMinor})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conditions))
    .groupBy(transactions.categoryId, transactions.currency)
    .all();
}

/**
 * Net spending (minor units, magnitude ≥ 0) for a single category + currency
 * within an inclusive date range. Used by the budgets module to compute spent.
 */
export function expenseTotalForCategory(
  db: Db,
  userId: string,
  categoryId: string,
  range: DateRange,
  currency: string,
): number {
  const conditions = [
    eq(transactions.userId, userId),
    eq(transactions.type, "expense"),
    eq(transactions.categoryId, categoryId),
    eq(transactions.currency, currency),
  ];
  if (range.from) {
    conditions.push(sql`${transactions.date} >= ${range.from}`);
  }
  if (range.to) {
    conditions.push(sql`${transactions.date} <= ${range.to}`);
  }

  const row = db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)` })
    .from(transactions)
    .where(and(...conditions))
    .get();

  return Math.abs(row?.total ?? 0);
}

/**
 * Savings = income − expenses. `expenseMinor` is the signed SUM (negative for
 * net spending). Returns a percentage (0–…, may be negative when overspent) or
 * `null` when there is no income — a division by zero guard.
 */
export function computeSavingsRate(incomeMinor: number, expenseMinor: number): number | null {
  if (incomeMinor <= 0) {
    return null;
  }
  const savingsMinor = incomeMinor + expenseMinor;
  return divideRound(savingsMinor, incomeMinor, 2);
}

/**
 * Balance per account grouped by currency, for "total balance by currency"
 * views. Only accounts belonging to the user are included.
 */
export function balanceTotalsByCurrency(db: Db, userId: string): { currency: string; totalMinor: number }[] {
  const rows = computeAccountBalances(db, userId);
  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.balanceMinor);
  }
  return [...byCurrency.entries()]
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
