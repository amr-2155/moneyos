import { db } from "./db";
import { currentUserId } from "./session";
import type {
  AnalyticsOverview,
  BudgetPerformanceView,
  CategoryAggregate,
  MonthlySummary,
  NetWorthPoint,
  PeriodComparison,
  SavingsGoalProgressView,
} from "./analyticsTypes";

/**
 * Local analytics computed from the device's own records.
 *
 * The backend exposes the same shapes under /api/analytics/*, but the app is
 * also shipped as a static bundle (GitHub Pages) and can run on a device with
 * no backend at all. These helpers mirror the backend's aggregation rules over
 * the local Dexie store so analytics always render, online or not.
 *
 * Rules kept identical to the server:
 *  - transfers are excluded from income and expenses;
 *  - reversed transactions (those carrying a reversalOfId) are excluded;
 *  - amounts are integer minor units and are never summed across currencies;
 *  - savings rate is null when income is zero.
 */

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthPart] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (monthPart ?? 1) - 1 + delta, 1);
  return monthKey(date);
}

function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => shiftMonth(monthKey(now), index - count + 1));
}

function isReversed(tx: { reversalOfId?: string | null; reversedAt?: string | null }): boolean {
  return Boolean(tx.reversalOfId || tx.reversedAt);
}

interface Totals {
  incomeMinor: number;
  expensesMinor: number;
}

function totalsFor(
  transactions: { type: string; amountMinor: number; date: string; currency: string; reversalOfId?: string | null; reversedAt?: string | null }[],
  currency: string,
  predicate: (tx: { date: string; type: string; currency: string }) => boolean,
): Totals {
  let incomeMinor = 0;
  let expensesMinor = 0;
  for (const tx of transactions) {
    if (tx.type === "transfer" || isReversed(tx)) continue;
    if (tx.currency !== currency) continue;
    if (!predicate(tx)) continue;
    if (tx.type === "income") incomeMinor += tx.amountMinor;
    if (tx.type === "expense") expensesMinor += tx.amountMinor;
  }
  return { incomeMinor, expensesMinor };
}

/** Monthly income/expense/savings for the given months, oldest first. */
export async function localMonthlySummary(currency: string, months: string[]): Promise<MonthlySummary[]> {
  const all = await db.transactions.where("userId").equals(currentUserId()).toArray();
  return months.map((month) => {
    const { incomeMinor, expensesMinor } = totalsFor(all, currency, (tx) => tx.date.startsWith(month));
    const savingsMinor = incomeMinor - expensesMinor;
    return {
      month,
      currency,
      incomeMinor,
      expensesMinor,
      savingsMinor,
      savingsRatePercent: incomeMinor > 0 ? Math.round((savingsMinor / incomeMinor) * 100) : null,
    };
  });
}

/** Expenses grouped by category, biggest first, with share percentages. */
export async function localCategoryBreakdown(currency: string, limit?: number): Promise<CategoryAggregate[]> {
  const all = await db.transactions.where("userId").equals(currentUserId()).toArray();
  const categories = await db.categories.where("userId").equals(currentUserId()).toArray();
  const names = new Map(categories.map((category) => [category.id, category.name]));

  const totals = new Map<string, { totalMinor: number; categoryId: string | null; categoryName: string }>();
  let grandTotal = 0;

  for (const tx of all) {
    if (tx.type !== "expense" || isReversed(tx) || tx.currency !== currency) continue;
    const key = tx.categoryId ?? "none";
    const entry = totals.get(key) ?? {
      totalMinor: 0,
      categoryId: tx.categoryId ?? null,
      categoryName: tx.categoryId ? names.get(tx.categoryId) ?? "Other" : "Other",
    };
    entry.totalMinor += tx.amountMinor;
    totals.set(key, entry);
    grandTotal += tx.amountMinor;
  }

  const aggregates = [...totals.entries()].map(([key, entry]) => ({
    categoryId: entry.categoryId,
    categoryName: entry.categoryName,
    currency,
    totalMinor: entry.totalMinor,
    percentOfTotal: grandTotal > 0 ? Math.round((entry.totalMinor / grandTotal) * 100) : 0,
    _key: key,
  }));

  aggregates.sort((a, b) => b.totalMinor - a.totalMinor);
  const limited = limit === undefined ? aggregates : aggregates.slice(0, limit);
  return limited.map(({ _key: _ignored, ...rest }) => rest);
}

/**
 * Net worth per month: every account's opening balance plus the cumulative
 * income/expense flow up to the end of that month.
 */
export async function localNetWorthTrend(currency: string, months: string[]): Promise<NetWorthPoint[]> {
  const accounts = await db.accounts.where("userId").equals(currentUserId()).toArray();
  const opening = accounts
    .filter((account) => account.currency === currency && account.isActive)
    .reduce((sum, account) => sum + (account.openingBalanceMinor ?? 0), 0);

  const all = await db.transactions.where("userId").equals(currentUserId()).toArray();

  return months.map((month) => {
    let cumulative = opening;
    for (const earlier of months) {
      if (earlier > month) continue;
      const totals = totalsFor(all, currency, (tx) => tx.date.startsWith(earlier));
      cumulative += totals.incomeMinor - totals.expensesMinor;
    }
    return { month, currency, totalMinor: cumulative };
  });
}

/** Current month against the previous one, with percentage changes. */
export async function localPeriodComparison(currency: string, month: string): Promise<PeriodComparison[]> {
  const previous = shiftMonth(month, -1);
  const all = await db.transactions.where("userId").equals(currentUserId()).toArray();

  const current = totalsFor(all, currency, (tx) => tx.date.startsWith(month));
  const prior = totalsFor(all, currency, (tx) => tx.date.startsWith(previous));

  const change = (now: number, before: number): number | null => {
    if (before === 0) return null;
    return Math.round(((now - before) / before) * 100);
  };

  return [
    {
      from: month,
      to: month,
      currency,
      currentIncomeMinor: current.incomeMinor,
      currentExpensesMinor: current.expensesMinor,
      previousIncomeMinor: prior.incomeMinor,
      previousExpensesMinor: prior.expensesMinor,
      incomeChangePercent: change(current.incomeMinor, prior.incomeMinor),
      expensesChangePercent: change(current.expensesMinor, prior.expensesMinor),
    },
  ];
}

/** Live budget progress for a period, mirroring the server status rules. */
export async function localBudgetPerformance(period?: string): Promise<BudgetPerformanceView[]> {
  const target = period ?? monthKey(new Date());
  const budgets = await db.budgets
    .where("userId")
    .equals(currentUserId())
    .filter((budget) => budget.period === target && !budget.isArchived)
    .toArray();
  if (budgets.length === 0) return [];

  const categories = await db.categories.where("userId").equals(currentUserId()).toArray();
  const names = new Map(categories.map((category) => [category.id, category.name]));

  const all = await db.transactions.where("userId").equals(currentUserId()).toArray();

  return budgets.map((budget) => {
    const spentMinor = all
      .filter(
        (tx) =>
          tx.type === "expense" &&
          !isReversed(tx) &&
          tx.currency === budget.currency &&
          tx.categoryId === budget.categoryId &&
          tx.date.startsWith(target),
      )
      .reduce((sum, tx) => sum + tx.amountMinor, 0);

    const remainingMinor = budget.amountMinor - spentMinor;
    const percentUsed = budget.amountMinor > 0 ? Math.round((spentMinor / budget.amountMinor) * 100) : 0;
    const threshold = budget.warningThresholdPercent ?? 80;
    const status: BudgetPerformanceView["status"] =
      spentMinor > budget.amountMinor ? "exceeded" : percentUsed >= threshold ? "approaching" : "normal";

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: names.get(budget.categoryId) ?? "Other",
      period: budget.period,
      amountMinor: budget.amountMinor,
      currency: budget.currency,
      spentMinor,
      remainingMinor,
      percentUsed,
      status,
      warningThresholdPercent: threshold,
      isArchived: false,
    };
  });
}

/** Savings goal progress, matching the server's shape. */
export async function localSavingsGoalProgress(): Promise<SavingsGoalProgressView[]> {
  const goals = await db.savingsGoals
    .where("userId")
    .equals(currentUserId())
    .filter((goal) => !goal.isArchived)
    .toArray();

  return goals.map((goal) => {
    const targetAmountMinor = goal.targetAmountMinor;
    const currentMinor = goal.currentMinor;
    const progressPercent = targetAmountMinor > 0 ? Math.round((currentMinor / targetAmountMinor) * 100) : 0;
    return {
      id: goal.id,
      name: goal.name,
      targetAmountMinor,
      currentMinor,
      currency: goal.currency,
      targetDate: goal.targetDate,
      progressPercent,
      achieved: targetAmountMinor > 0 && currentMinor >= targetAmountMinor,
      remainingMinor: Math.max(0, targetAmountMinor - currentMinor),
      isArchived: false,
    };
  });
}

/** Everything the overview card needs, in one read. */
export async function localAnalyticsOverview(
  currency: string,
  from?: string,
  to?: string,
  limit?: number,
): Promise<AnalyticsOverview> {
  const months = buildMonthRange(from, to);
  const [summaries, spendingByCategory, netWorthTrend] = await Promise.all([
    localMonthlySummary(currency, months),
    localCategoryBreakdown(currency, limit),
    localNetWorthTrend(currency, months),
  ]);
  // `months` on the overview is the per-month summary series, not the raw keys.
  return { query: { from, to, currency }, months: summaries, spendingByCategory, netWorthTrend };
}

function buildMonthRange(from?: string, to?: string): string[] {
  const end = to ?? monthKey(new Date());
  const start = from ?? end;
  const months: string[] = [];
  let cursor = start;
  // Guard against a malformed range producing an unbounded loop.
  for (let guard = 0; guard < 60 && cursor <= end; guard += 1) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months.length > 0 ? months : lastMonths(6);
}

/** True when this device has a real backend token rather than a local session. */
export function canUseBackend(): boolean {
  try {
    return localStorage.getItem("moneyos.accessToken") !== "local";
  } catch {
    return false;
  }
}
