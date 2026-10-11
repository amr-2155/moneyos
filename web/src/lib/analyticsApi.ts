import { getAccessToken } from "./api.js";
import {
  canUseBackend,
  localAnalyticsOverview,
  localBudgetPerformance,
  localCategoryBreakdown,
  localMonthlySummary,
  localPeriodComparison,
  localSavingsGoalProgress,
} from "./localAnalytics.js";
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
 * Runs the backend call and falls back to the equivalent local computation when
 * the backend simply is not reachable. A real rejection (401, 403, validation)
 * still propagates so the page can tell "session expired" apart from "no data".
 */
async function withLocalFallback<T>(request: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  if (!canUseBackend()) return local();
  try {
    return await request();
  } catch (error) {
    // NO_BACKEND means nothing answered /api (static host or dropped connection),
    // so local data is the only answer. A real HTTP status means the backend
    // replied and its verdict must stand.
    if (error instanceof HttpError && error.code !== "NO_BACKEND") throw error;
    return local();
  }
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
  }).catch(() => {
    // fetch itself rejected — network down, server unreachable, or dev-proxy
    // misconfigured. Surface this as a recoverable "NO_BACKEND" so callers
    // (and withLocalFallback) can fall back to local data instead of throwing
    // a raw TypeError that bypasses every error-mapping path.
    throw new HttpError("Cannot reach backend", 0, "NO_BACKEND");
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = response.statusText;
    try {
      const body = await response.json();
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // A static host answers unknown /api paths with HTML, so there is no JSON
      // envelope. Report it as a missing backend so callers can fall back.
      throw new HttpError("No backend available", response.status, "NO_BACKEND");
    }
    throw new HttpError(message, response.status, code);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError("No backend available", response.status, "NO_BACKEND");
  }

  return response.json() as Promise<T>;
}

/**
 * Wraps an AnalyticsQuery (which may be undefined) into the params
 * shape expected by `apiFetch`.
 */
/** Last `count` months ending with the current one, oldest first. */
function buildRecentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Wraps a backend query param set so the local fallback receives the same shape.
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
    withLocalFallback(
      () => apiFetch<AnalyticsOverview>("/analytics/overview", qp(query)),
      () =>
        localAnalyticsOverview(
          query?.currency ?? "EGP",
          query?.from,
          query?.to,
          query?.limit,
        ),
    ),

  /** Monthly income / expense / savings / savings-rate per month, per currency. */
  monthlySummary: (query?: AnalyticsQuery) =>
    withLocalFallback(
      () => apiFetch<MonthlySummary[]>("/analytics/monthly-summary", qp(query)),
      async () => {
        if (query?.from && query?.to) {
          const overview = await localAnalyticsOverview(query.currency ?? "EGP", query.from, query.to);
          return overview.months;
        }
        return localMonthlySummary(query?.currency ?? "EGP", buildRecentMonths(query?.months ?? 6));
      },
    ),

  /** Expense breakdown by category with percentages (limited by `?limit=`). */
  categoryBreakdown: (query?: AnalyticsQuery) =>
    withLocalFallback(
      () => apiFetch<CategoryAggregate[]>("/analytics/category-breakdown", qp(query)),
      () => localCategoryBreakdown(query?.currency ?? "EGP", query?.limit),
    ),

  /** Income vs expense trend over the last N months, per currency. */
  incomeExpenseTrend: (query?: AnalyticsQuery) =>
    withLocalFallback(
      () => apiFetch<MonthlySummary[]>("/analytics/income-expense-trend", qp(query)),
      () => localMonthlySummary(query?.currency ?? "EGP", buildRecentMonths(query?.months ?? 6)),
    ),

  /** Current vs previous period comparison with percentage change. */
  periodComparison: (query?: AnalyticsQuery) =>
    withLocalFallback(
      () => apiFetch<PeriodComparison[]>("/analytics/period-comparison", qp(query)),
      async () => {
        if (query?.month) return localPeriodComparison(query.currency ?? "EGP", query.month);
        const overview = await localAnalyticsOverview(query?.currency ?? "EGP");
        const month = overview.months[overview.months.length - 1]?.month ?? currentMonthKey();
        return localPeriodComparison(query?.currency ?? "EGP", month);
      },
    ),

  /** Cumulative net worth (opening balance + monthly flow) per month. */
  netWorthTrend: (query?: AnalyticsQuery) =>
    withLocalFallback(
      () => apiFetch<NetWorthPoint[]>("/analytics/net-worth-trend", qp(query)),
      async () => {
        const overview = await localAnalyticsOverview(query?.currency ?? "EGP", query?.from, query?.to);
        return overview.netWorthTrend;
      },
    ),
  /** Live budget performance: spent, remaining, status. */
  budgetPerformance: (query?: { period?: string; includeArchived?: boolean }) => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (query?.period !== undefined) params.period = query.period;
    if (query?.includeArchived !== undefined) params.includeArchived = query.includeArchived;
    return withLocalFallback(
      () => apiFetch<BudgetPerformanceView[]>("/analytics/budget-performance", params),
      () => localBudgetPerformance(query?.period),
    );
  },

  /** Savings goal progress: current, target, progress %, remaining. */
  savingsGoalProgress: (query?: { includeArchived?: boolean }) => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (query?.includeArchived !== undefined) params.includeArchived = query.includeArchived;
    return withLocalFallback(
      () => apiFetch<SavingsGoalProgressView[]>("/analytics/savings-goal-progress", params),
      () => localSavingsGoalProgress(),
    );
  },
};
