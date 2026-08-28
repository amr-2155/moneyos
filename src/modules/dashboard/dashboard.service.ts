import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { currentMonthStr, lastNMonths, monthRange } from "../../lib/dates.js";
import {
  balanceTotalsByCurrency,
  computeSavingsRate,
  expenseTotalsByCategory,
  totalsByMonthTypeAndCurrency,
  totalsByTypeAndCurrency,
} from "../../lib/ledger.js";
import { divideRound, formatMinorToAmount } from "../../lib/money.js";
import type { AccountService } from "../accounts/accounts.service.js";
import type { TransactionView, TransactionService } from "../transactions/transactions.service.js";

export interface DashboardQuery {
  month?: string;
  currency?: string;
}

export interface DashboardView {
  month: string;
  currency: string;
  /** Total balance per currency (never combined across currencies). */
  balances: { currency: string; amountMinor: number; amount: string }[];
  /** Total balance in the selected currency only. */
  totalBalanceMinor: number;
  monthSummary: {
    incomeMinor: number;
    income: string;
    expensesMinor: number;
    expenses: string;
    savingsMinor: number;
    savings: string;
    /** Percentage, or null when income is zero. */
    savingsRatePercent: number | null;
  };
  spendingByCategory: {
    categoryId: string | null;
    categoryName: string;
    icon: string | null;
    color: string | null;
    amountMinor: number;
    amount: string;
    percentOfTotal: number;
  }[];
  /** Income vs expenses for the last 6 months, in the selected currency. */
  trend: {
    month: string;
    incomeMinor: number;
    income: string;
    expensesMinor: number;
    expenses: string;
  }[];
  recentTransactions: TransactionView[];
  accountBalances: {
    accountId: string;
    name: string;
    type: string;
    currency: string;
    balanceMinor: number;
    balance: string;
  }[];
}

function totalsForCurrency(
  totals: { type: string; currency: string; totalMinor: number }[],
  currency: string,
): { income: number; expenses: number } {
  return {
    income: totals.find((t) => t.type === "income" && t.currency === currency)?.totalMinor ?? 0,
    expenses: totals.find((t) => t.type === "expense" && t.currency === currency)?.totalMinor ?? 0,
  };
}

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly accounts: AccountService,
    private readonly transactions: TransactionService,
  ) {}

  async getOverview(userId: string, query: DashboardQuery = {}): Promise<DashboardView> {
    const month = query.month ?? currentMonthStr();
    const { start, end } = monthRange(month);
    const range = { from: start, to: end };

    const currency = query.currency ?? (await this.getDefaultCurrency(userId));

    const monthTotals = totalsByTypeAndCurrency(this.db, userId, range);
    const { income, expenses } = totalsForCurrency(monthTotals, currency);

    const incomeMinor = income;
    const expensesMinor = expenses;
    const savingsMinor = incomeMinor + expensesMinor;
    const savingsRatePercent = computeSavingsRate(incomeMinor, expensesMinor);

    const categoryTotals = expenseTotalsByCategory(this.db, userId, range, currency);
    const totalCategoryExpenseMinor = categoryTotals.reduce(
      (sum, row) => sum + Math.abs(row.totalMinor),
      0,
    );
    const spendingByCategory = categoryTotals
      .map((row) => {
        const amountMinor = Math.abs(row.totalMinor);
        return {
          categoryId: row.categoryId,
          categoryName: row.categoryName ?? "Uncategorized",
          icon: row.icon,
          color: row.color,
          amountMinor,
          amount: formatMinorToAmount(amountMinor, row.currency),
          percentOfTotal:
            totalCategoryExpenseMinor > 0
              ? divideRound(amountMinor, totalCategoryExpenseMinor, 2)
              : 0,
        };
      })
      .sort((a, b) => b.amountMinor - a.amountMinor);

    const trendMonths = lastNMonths(month, 6);
    const trendRows = totalsByMonthTypeAndCurrency(
      this.db,
      userId,
      { fromMonth: trendMonths[0]!, toMonth: month },
      currency,
    );
    const trend = trendMonths.map((trendMonth) => {
      const incomeMinor = trendRows.find(
        (r) => r.month === trendMonth && r.type === "income",
      )?.totalMinor ?? 0;
      const expensesMinor = trendRows.find(
        (r) => r.month === trendMonth && r.type === "expense",
      )?.totalMinor ?? 0;
      return {
        month: trendMonth,
        incomeMinor,
        income: formatMinorToAmount(incomeMinor, currency),
        expensesMinor,
        expenses: formatMinorToAmount(expensesMinor, currency),
      };
    });

    const recent: { data: TransactionView[] } = await this.transactions.list(userId, {
      page: 1,
      limit: 10,
      sort: "date_desc",
    });

    const accounts = await this.accounts.list(userId);
    const accountBalances = accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balanceMinor: account.balanceMinor,
      balance: account.balance,
    }));

    const balances = balanceTotalsByCurrency(this.db, userId).map((b) => ({
      currency: b.currency,
      amountMinor: b.totalMinor,
      amount: formatMinorToAmount(b.totalMinor, b.currency),
    }));
    const totalBalanceMinor = balances.find((b) => b.currency === currency)?.amountMinor ?? 0;

    return {
      month,
      currency,
      balances,
      totalBalanceMinor,
      monthSummary: {
        incomeMinor,
        income: formatMinorToAmount(incomeMinor, currency),
        expensesMinor: Math.abs(expensesMinor),
        expenses: formatMinorToAmount(Math.abs(expensesMinor), currency),
        savingsMinor,
        savings: formatMinorToAmount(savingsMinor, currency),
        savingsRatePercent,
      },
      spendingByCategory,
      trend,
      recentTransactions: recent.data,
      accountBalances,
    };
  }

  private async getDefaultCurrency(userId: string): Promise<string> {
    const user = await this.db
      .select({ defaultCurrency: users.defaultCurrency })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return user?.defaultCurrency ?? "EGP";
  }
}
