import { getAccessToken } from "./api.js";
import type {
  AnalyticsOverview,
  AnalyticsQuery,
  BudgetPerformanceView,
  CategoryAggregate,
  MonthlySummary,
  NetWorthPoint,
  PeriodComparison,
  SavingsGoalProgressView,
} from "./analyticsTypes.js";

/**
 * Error thrown when an HTTP request to the backend fails.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      qs.append(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

/**
 * Core fetch wrapper for backend API calls.
 * Sends the stored access token as a Bearer token and parses JSON.
 * Throws an `HttpError` on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const token = getAccessToken();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`/api${path}${buildQuery(params ?? {})}`, {
    headers,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = response.statusText;
    try {
      const body = await response.json();
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // fall through — use raw status text
    }
    throw new HttpError(message, response.status, code);
  }

  return response.json() as Promise<T>;
}

/**
 * Wraps an AnalyticsQuery (which may be undefined) into the params
 * shape expected by `apiFetch`.
 */
function qp(query: AnalyticsQuery | undefined): Record<string, string | number | boolean | undefined> | undefined {
  if (!query) return undefined;
  const params: Record<string, string | number | boolean | undefined> = {};
  if (query.from !== undefined) params.from = query.from;
  if (query.to !== undefined) params.to = query.to;
  if (query.month !== undefined) params.month = query.month;
  if (query.months !== undefined) params.months = query.months;
  if (query.currency !== undefined) params.currency = query.currency;
  if (query.limit !== undefined) params.limit = query.limit;
  return params;
}

/**
 * Analytics API client — wraps the 8 Phase 7 backend endpoints.
 * All methods are async and return typed responses.
 */
export const analyticsApi = {
  /** Combined overview: monthly summaries, category breakdown, and net worth trend. */
  overview: (query?: AnalyticsQuery) =>
    apiFetch<AnalyticsOverview>("/analytics/overview", qp(query)),

  /** Monthly income / expense / savings / savings-rate per month, per currency. */
  monthlySummary: (query?: AnalyticsQuery) =>
    apiFetch<MonthlySummary[]>("/analytics/monthly-summary", qp(query)),

  /** Expense breakdown by category with percentages (limited by `?limit=`). */
  categoryBreakdown: (query?: AnalyticsQuery) =>
    apiFetch<CategoryAggregate[]>("/analytics/category-breakdown", qp(query)),

  /** Income vs expense trend over the last N months, per currency. */
  incomeExpenseTrend: (query?: AnalyticsQuery) =>
    apiFetch<MonthlySummary[]>("/analytics/income-expense-trend", qp(query)),

  /** Current vs previous period comparison with percentage change. */
  periodComparison: (query?: AnalyticsQuery) =>
    apiFetch<PeriodComparison[]>("/analytics/period-comparison", qp(query)),

  /** Cumulative net worth (opening balance + monthly flow) per month. */
  netWorthTrend: (query?: AnalyticsQuery) =>
    apiFetch<NetWorthPoint[]>("/analytics/net-worth-trend", qp(query)),

  /** Live budget performance: spent, remaining, status. */
  budgetPerformance: (query?: { period?: string; includeArchived?: boolean }) => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (query?.period !== undefined) params.period = query.period;
    if (query?.includeArchived !== undefined) params.includeArchived = query.includeArchived;
    return apiFetch<BudgetPerformanceView[]>("/analytics/budget-performance", params);
  },

  /** Savings goal progress: current, target, progress %, remaining. */
  savingsGoalProgress: (query?: { includeArchived?: boolean }) => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (query?.includeArchived !== undefined) params.includeArchived = query.includeArchived;
    return apiFetch<SavingsGoalProgressView[]>("/analytics/savings-goal-progress", params);
  },
};
