/**
 * Analytics module — reusable, UI-agnostic financial analytics.
 *
 * All analytics are computed from the immutable transaction ledger and are
 * always scoped to a single authenticated user. Monetary values are returned
 * as integer minor units; the caller is responsible for formatting.
 *
 * Currency handling: every aggregate is computed per-currency. When a currency
 * is requested, only transactions in that currency are included. When no
 * currency is requested, each currency appears as its own entry — currencies
 * are never silently combined.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { accounts, budgets, categories, savingsGoals, type Budget } from "../../db/schema.js";
import { addMonths, currentMonthStr, monthRange } from "../../lib/dates.js";
import {
  computeSavingsRate,
  expenseTotalForCategory,
  expenseTotalsByCategory,
  netWorthTrend,
  totalsByMonthTypeAndCurrency,
  totalsByTypeAndCurrency,
} from "../../lib/ledger.js";
import { divideRound, formatMinorToAmount } from "../../lib/money.js";

export interface AnalyticsQuery {
  month?: string;
  from?: string;
  to?: string;
  currency?: string;
  months?: number;
}

export interface MonthlySummary {
  month: string;
  currency: string;
  incomeMinor: number;
  expensesMinor: number;
  savingsMinor: number;
  savingsRatePercent: number | null;
}

export interface CategoryAggregate {
  categoryId: string | null;
  categoryName: string;
  currency: string;
  totalMinor: number;
  percentOfTotal: number;
}

export interface PeriodComparison {
  from: string;
  to: string;
  currency: string;
  currentIncomeMinor: number;
  currentExpensesMinor: number;
  previousIncomeMinor: number;
  previousExpensesMinor: number;
  incomeChangePercent: number | null;
  expensesChangePercent: number | null;
}

export interface NetWorthPoint {
  month: string;
  currency: string;
  totalMinor: number;
}

export interface BudgetPerformanceView {
  id: string;
  categoryId: string;
  categoryName: string;
  period: string;
  amount: string;
  amountMinor: number;
  currency: string;
  spent: string;
  spentMinor: number;
  remaining: string;
  remainingMinor: number;
  percentUsed: number;
  status: "normal" | "approaching" | "exceeded";
  warningThresholdPercent: number;
  isArchived: boolean;
}

export interface SavingsGoalProgressView {
  id: string;
  name: string;
  targetAmount: string;
  targetAmountMinor: number;
  currentAmount: string;
  currentMinor: number;
  currency: string;
  targetDate: string | null;
  progressPercent: number;
  achieved: boolean;
  remainingAmount: string;
  remainingMinor: number;
  isArchived: boolean;
}

export interface AnalyticsOverview {
  query: { from?: string; to?: string; currency?: string };
  months: MonthlySummary[];
  spendingByCategory: CategoryAggregate[];
  netWorthTrend: NetWorthPoint[];
}

const DEFAULT_ANALYTICS_MONTHS = 6;
const MAX_TREND_MONTHS = 24;
const MAX_PERIOD_COMPARISON_MONTHS = 12;

/** Expands a YYYY-MM range into an inclusive list of month strings. */
function expandMonths(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  const parts = fromMonth.split("-").map(Number);
  const endParts = toMonth.split("-").map(Number);
  let year = parts[0]!;
  let m = parts[1]!;
  const endYear = endParts[0]!;
  const endMonth = endParts[1]!;
  while (year < endYear || (year === endYear && m <= endMonth)) {
    months.push(`${year}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      year++;
    }
  }
  return months;
}

/** Resolves the (fromMonth, toMonth) range from a query, defaulting to the last 6 months. */
function resolveMonthRange(query: AnalyticsQuery): { from: string; to: string } {
  const toMonth = query.month ?? currentMonthStr();
  const months = clampMonths(query.months ?? DEFAULT_ANALYTICS_MONTHS, MAX_TREND_MONTHS);
  const from = query.from ?? addMonths(toMonth, -(months - 1));
  const to = query.to ?? toMonth;
  return { from, to };
}

function clampMonths(value: number, max: number): number {
  return Math.max(1, Math.min(value, max));
}

/** Returns `null` when previous is 0 (undefined growth), else the half-up percent change. */
function percentChange(previous: number, current: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return divideRound(current - previous, Math.abs(previous), 2);
}

/**
 * Reusable, UI-agnostic analytics service.
 *
 * All methods are pure reads over the transaction ledger and are scoped to
 * a single user. Monetary values are returned in integer minor units.
 */
export class AnalyticsService {
  constructor(private readonly db: Db) {}

  /**
   * Monthly income / expense / savings / savings-rate for each month in the
   * queried range. When `currency` is given, only that currency is returned.
   * Otherwise one entry per (month, currency) combination is produced.
   */
  async monthlySummary(userId: string, query: AnalyticsQuery): Promise<MonthlySummary[]> {
    const range = resolveMonthRange(query);
    const totals = totalsByMonthTypeAndCurrency(
      this.db,
      userId,
      { fromMonth: range.from, toMonth: range.to },
      query.currency,
    );

    const currencies = query.currency
      ? [query.currency]
      : Array.from(new Set(totals.map((t) => t.currency))).sort();
    // Fallback to account currencies when there are no transactions in the range,
    // so months with zero activity still appear per account currency.
    if (currencies.length === 0 && !query.currency) {
      currencies.push(...(await this.listCurrencies(userId)));
    }

    const months = expandMonths(range.from, range.to);

    const result: MonthlySummary[] = [];
    for (const currency of currencies) {
      for (const month of months) {
        const income = totals.find((t) => t.month === month && t.type === "income" && t.currency === currency)?.totalMinor ?? 0;
        const expense = totals.find((t) => t.month === month && t.type === "expense" && t.currency === currency)?.totalMinor ?? 0;
        const savings = income + expense; // expense is negative (signed)
        const savingsRate = computeSavingsRate(income, expense);
        result.push({
          month,
          currency,
          incomeMinor: income,
          expensesMinor: expense,
          savingsMinor: savings,
          savingsRatePercent: savingsRate,
        });
      }
    }
    return result;
  }

  /**
   * Expense breakdown by category for the queried range, with each category's
   * share of the total. Transfers are excluded (type "transfer").
   * Sorted by amount descending; limited to `limit` entries.
   */
  async categoryBreakdown(
    userId: string,
    query: AnalyticsQuery & { limit: number },
  ): Promise<CategoryAggregate[]> {
    const range = resolveMonthRange(query);
    const rows = expenseTotalsByCategory(
      this.db,
      userId,
      { from: `${range.from}-01`, to: `${range.to}-31` },
      query.currency,
    );

    // Group by currency.
    const byCurrency = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = byCurrency.get(row.currency) ?? [];
      existing.push(row);
      byCurrency.set(row.currency, existing);
    }

    const result: CategoryAggregate[] = [];
    const currencies = query.currency ? [query.currency] : [...byCurrency.keys()].sort();

    for (const currency of currencies) {
      const catRows = byCurrency.get(currency) ?? [];
      const totalExpenseMinor = catRows.reduce(
        (sum, row) => sum + Math.abs(row.totalMinor),
        0,
      );

      const sorted = catRows
        .map((row) => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName ?? "Uncategorized",
          currency: row.currency,
          totalMinor: Math.abs(row.totalMinor),
          percentOfTotal:
            totalExpenseMinor > 0
              ? divideRound(Math.abs(row.totalMinor), totalExpenseMinor, 2)
              : 0,
        }))
        .sort((a, b) => b.totalMinor - a.totalMinor)
        .slice(0, query.limit);

      result.push(...sorted);
    }
    return result;
  }

  /**
   * Income vs expenses for the last N months (default 6), per currency.
   * Useful for trend charts.
   */
  async incomeExpenseTrend(userId: string, query: AnalyticsQuery): Promise<MonthlySummary[]> {
    const range = resolveMonthRange(query);
    const totals = totalsByMonthTypeAndCurrency(
      this.db,
      userId,
      { fromMonth: range.from, toMonth: range.to },
      query.currency,
    );

    let currencies = query.currency
      ? [query.currency]
      : Array.from(new Set(totals.map((t) => t.currency))).sort();
    if (currencies.length === 0 && !query.currency) {
      currencies = await this.listCurrencies(userId);
    }
    const months = expandMonths(range.from, range.to);

    const result: MonthlySummary[] = [];
    for (const currency of currencies) {
      for (const month of months) {
        const income = totals.find((t) => t.month === month && t.type === "income" && t.currency === currency)?.totalMinor ?? 0;
        const expense = totals.find((t) => t.month === month && t.type === "expense" && t.currency === currency)?.totalMinor ?? 0;
        const savings = income + expense;
        const savingsRate = computeSavingsRate(income, expense);
        result.push({
          month,
          currency,
          incomeMinor: income,
          expensesMinor: expense,
          savingsMinor: savings,
          savingsRatePercent: savingsRate,
        });
      }
    }
    return result;
  }

  /**
   * Compare income and expenses between the current period and the previous
   * period of the same length. Returns percentage change for each.
   */
  async periodComparison(userId: string, query: AnalyticsQuery): Promise<PeriodComparison[]> {
    const toMonth = query.month ?? currentMonthStr();
    const months = clampMonths(query.months ?? 3, MAX_PERIOD_COMPARISON_MONTHS);
    const currentFrom = addMonths(toMonth, -(months - 1));
    const prevTo = addMonths(currentFrom, -1);
    const prevFrom = addMonths(prevTo, -(months - 1));

    const currencies = query.currency ? [query.currency] : await this.listCurrencies(userId);

    const result: PeriodComparison[] = [];
    for (const currency of currencies) {
      const currentTotals = totalsByTypeAndCurrency(
        this.db,
        userId,
        { from: `${currentFrom}-01`, to: `${toMonth}-31` },
      ).filter((t) => t.currency === currency);
      const prevTotals = totalsByTypeAndCurrency(
        this.db,
        userId,
        { from: `${prevFrom}-01`, to: `${prevTo}-31` },
      ).filter((t) => t.currency === currency);

      const currentIncome = currentTotals.find((t) => t.type === "income")?.totalMinor ?? 0;
      const currentExpenses = currentTotals.find((t) => t.type === "expense")?.totalMinor ?? 0;
      const prevIncome = prevTotals.find((t) => t.type === "income")?.totalMinor ?? 0;
      const prevExpenses = prevTotals.find((t) => t.type === "expense")?.totalMinor ?? 0;

      result.push({
        from: currentFrom,
        to: toMonth,
        currency,
        currentIncomeMinor: currentIncome,
        currentExpensesMinor: currentExpenses,
        previousIncomeMinor: prevIncome,
        previousExpensesMinor: prevExpenses,
        incomeChangePercent: percentChange(prevIncome, currentIncome),
        expensesChangePercent: percentChange(prevExpenses, currentExpenses),
      });
    }
    return result;
  }

  /**
   * Net worth (total balance) trend over the last N months, per currency.
   * Computed from opening balances + cumulative transaction flow.
   */
  async netWorthTrend(userId: string, query: AnalyticsQuery): Promise<NetWorthPoint[]> {
    const range = resolveMonthRange(query);

    const rows = netWorthTrend(
      this.db,
      userId,
      { fromMonth: range.from, toMonth: range.to },
      query.currency,
    );

    return rows.map((r) => ({
      month: r.month,
      currency: r.currency,
      totalMinor: r.totalMinor,
    }));
  }

  /**
   * Budget performance summary for all active budgets (optionally filtered by
   * period). Spent is derived live from transactions; status is computed
   * from the configurable warning threshold.
   */
  async budgetPerformance(
    userId: string,
    query: { period?: string; includeArchived?: boolean },
  ): Promise<BudgetPerformanceView[]> {
    const conditions = [eq(budgets.userId, userId)];
    if (!query.includeArchived) {
      conditions.push(eq(budgets.isArchived, false));
    }
    if (query.period) {
      conditions.push(eq(budgets.period, query.period));
    }

    const rows = await this.db
      .select()
      .from(budgets)
      .where(and(...conditions))
      .orderBy(desc(budgets.period), desc(budgets.createdAt))
      .all();

    return Promise.all(rows.map((b) => this.budgetToView(b)));
  }

  private async budgetToView(budget: Budget): Promise<BudgetPerformanceView> {
    const { start, end } = monthRange(budget.period);
    const spentMinor = expenseTotalForCategory(
      this.db,
      budget.userId,
      budget.categoryId,
      { from: start, to: end },
      budget.currency,
    );

    const remainingMinor = budget.amountMinor - spentMinor;
    const percentUsed = divideRound(spentMinor, budget.amountMinor, 2);
    let status: "normal" | "approaching" | "exceeded" = "normal";
    if (spentMinor >= budget.amountMinor) {
      status = "exceeded";
    } else if (percentUsed >= budget.warningThresholdPercent) {
      status = "approaching";
    }

    const category = await this.db
      .select({ name: categories.name, icon: categories.icon, color: categories.color })
      .from(categories)
      .where(eq(categories.id, budget.categoryId))
      .get();

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: category?.name ?? "Uncategorized",
      period: budget.period,
      amount: formatMinorToAmount(budget.amountMinor, budget.currency),
      amountMinor: budget.amountMinor,
      currency: budget.currency,
      spent: formatMinorToAmount(spentMinor, budget.currency),
      spentMinor,
      remaining: formatMinorToAmount(remainingMinor, budget.currency),
      remainingMinor,
      percentUsed,
      status,
      warningThresholdPercent: budget.warningThresholdPercent,
      isArchived: budget.isArchived,
    };
  }

  /**
   * Savings goal progress summary for all active goals (optionally including
   * archived). Progress %, remaining amount, and estimated required monthly
   * savings to hit the target date are computed.
   */
  async savingsGoalProgress(
    userId: string,
    query: { includeArchived?: boolean },
  ): Promise<SavingsGoalProgressView[]> {
    const conditions = [eq(savingsGoals.userId, userId)];
    if (!query.includeArchived) {
      conditions.push(eq(savingsGoals.isArchived, false));
    }

    const rows = await this.db
      .select()
      .from(savingsGoals)
      .where(and(...conditions))
      .orderBy(desc(savingsGoals.createdAt))
      .all();

    return rows.map((g): SavingsGoalProgressView => {
      const progressPercent =
        g.targetMinor > 0
          ? divideRound(g.currentMinor, g.targetMinor, 2)
          : 0;
      const achieved = g.currentMinor >= g.targetMinor;
      const remainingMinor = Math.max(0, g.targetMinor - g.currentMinor);

      return {
        id: g.id,
        name: g.name,
        targetAmount: formatMinorToAmount(g.targetMinor, g.currency),
        targetAmountMinor: g.targetMinor,
        currentAmount: formatMinorToAmount(g.currentMinor, g.currency),
        currentMinor: g.currentMinor,
        currency: g.currency,
        targetDate: g.targetDate,
        progressPercent,
        achieved,
        remainingAmount: formatMinorToAmount(remainingMinor, g.currency),
        remainingMinor,
        isArchived: g.isArchived,
      };
    });
  }

  /**
   * Comprehensive overview combining monthly summaries, category breakdown,
   * and net worth trend into a single response.
   */
  async overview(userId: string, query: AnalyticsQuery): Promise<AnalyticsOverview> {
    const range = resolveMonthRange(query);

    const [months, spendingByCategory, trend] = await Promise.all([
      this.monthlySummary(userId, { ...query, from: range.from, to: range.to }),
      this.categoryBreakdown(userId, { ...query, limit: 10 }),
      this.netWorthTrend(userId, { ...query, from: range.from, to: range.to }),
    ]);

    return {
      query: { from: range.from, to: range.to, currency: query.currency },
      months,
      spendingByCategory,
      netWorthTrend: trend,
    };
  }

  // --- Private helpers ---

  private async listCurrencies(userId: string): Promise<string[]> {
    const rows = this.db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .all();
    return Array.from(new Set(rows.map((r) => r.currency))).sort();
  }
}
