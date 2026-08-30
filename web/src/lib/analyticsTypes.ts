/**
 * Analytics API types — mirror the backend's Phase 7 endpoints.
 * All endpoints are under /api/analytics/* and require a Bearer token.
 * Monetary values are integer minor units unless otherwise noted.
 */

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
  amountMinor: number;
  currency: string;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
  status: "normal" | "approaching" | "exceeded";
  warningThresholdPercent: number;
  isArchived: boolean;
}

export interface SavingsGoalProgressView {
  id: string;
  name: string;
  targetAmountMinor: number;
  currentMinor: number;
  currency: string;
  targetDate: string | null;
  progressPercent: number;
  achieved: boolean;
  remainingMinor: number;
  isArchived: boolean;
}

export interface AnalyticsOverview {
  query: { from?: string; to?: string; currency?: string };
  months: MonthlySummary[];
  spendingByCategory: CategoryAggregate[];
  netWorthTrend: NetWorthPoint[];
}

export type AnalyticsQuery = {
  from?: string;
  to?: string;
  month?: string;
  months?: number;
  currency?: string;
  limit?: number;
};
