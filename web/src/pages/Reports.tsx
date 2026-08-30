import { useCallback, useEffect, useMemo, useState } from "react";
import { analyticsApi, HttpError } from "../lib/analyticsApi";
import { currentMonth, formatCurrency, formatMonth } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { useErrorMessage } from "../lib/errors";
import { categoryEmoji, localizeCategoryName } from "../lib/categoryNames";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  SkeletonCard,
  SkeletonBlock,
  StatCard,
  SegmentedControl,
} from "../components/ui";
import { Icon } from "../components/Icon";
import type {
  AnalyticsOverview,
  AnalyticsQuery,
  BudgetPerformanceView,
  NetWorthPoint,
  PeriodComparison,
  SavingsGoalProgressView,
} from "../lib/analyticsTypes";

type Period = "month" | "three" | "six";

/** Returns [{from, to}] month strings for the given (toMonth, months) pair. */
function monthsForPeriod(period: Period, toMonth?: string): { from: string; to: string } {
  const to = toMonth ?? currentMonth();
  const count = period === "month" ? 1 : period === "three" ? 3 : 6;
  const [ey, em] = to.split("-").map(Number);
  const fromYear = em! - count < 1 ? ey! - 1 : ey!;
  const fromMonth = ((em! - count - 1 + 12) % 12) + 1;
  return {
    from: `${fromYear}-${String(fromMonth).padStart(2, "0")}`,
    to,
  };
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function diffLabel(curr: number, prev: number): { text: string; dir: "up" | "down" } | null {
  if (prev <= 0) return null;
  const diff = Math.round(((curr - prev) / prev) * 100);
  if (diff === 0) return null;
  return { text: `${Math.abs(diff)}%`, dir: diff > 0 ? "up" : "down" };
}

function budgetStatusColor(status: BudgetPerformanceView["status"]): "positive" | "warning" | "danger" {
  return status === "exceeded" ? "danger" : status === "approaching" ? "warning" : "positive";
}

function budgetBadgeTone(status: BudgetPerformanceView["status"]): "neutral" | "success" | "warning" | "danger" | "primary" {
  return status === "exceeded" ? "danger" : status === "approaching" ? "warning" : "success";
}

export function ReportsPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const currency = user?.defaultCurrency ?? "EGP";

  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(currentMonth());
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof analyticsApi.categoryBreakdown>> | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthPoint[] | null>(null);
  const [budgets, setBudgets] = useState<BudgetPerformanceView[] | null>(null);
  const [goals, setGoals] = useState<SavingsGoalProgressView[] | null>(null);
  const [comparison, setComparison] = useState<PeriodComparison[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => monthsForPeriod(period, month), [period, month]);
  const query: AnalyticsQuery = useMemo(
    () => ({ from: range.from, to: range.to, currency }),
    [range, currency],
  );

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    Promise.all([
      analyticsApi.overview(query),
      analyticsApi.categoryBreakdown({ ...query, limit: 10 }),
      analyticsApi.netWorthTrend(query),
      analyticsApi.budgetPerformance({}),
      analyticsApi.savingsGoalProgress({}),
      analyticsApi.periodComparison({ month: month, months: period === "month" ? 1 : period === "three" ? 1 : 1 }),
    ])
      .then(([ov, cats, nwt, b, g, pc]) => {
        if (cancelled) return;
        setOverview(ov);
        setCategories(cats);
        setNetWorth(nwt);
        setBudgets(b);
        setGoals(g);
        setComparison(pc);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
            setError("errors.sessionExpired");
          } else {
            setError(getError(err, "errors.network"));
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, month, period, currency, getError]);

  useEffect(() => load(), [load]);

  /* --- derived data --- */
  const monthPoints = overview?.months ?? [];
  const currentMonthData = monthPoints.find((m) => m.month === range.to && m.currency === currency);
  const income = currentMonthData?.incomeMinor ?? 0;
  const expenses = Math.abs(currentMonthData?.expensesMinor ?? 0);
  const savings = currentMonthData?.savingsMinor ?? 0;
  const savingsRate = currentMonthData?.savingsRatePercent ?? null;
  const hasData = income > 0 || expenses > 0;

  const currentCurrencyComparison = useMemo(
    () => comparison?.find((c) => c.currency === currency),
    [comparison, currency],
  );
  const trendData = useMemo(
    () =>
      monthPoints
        .filter((m) => m.currency === currency)
        .map((m) => ({
          month: m.month,
          incomeMinor: m.incomeMinor,
          expensesMinor: m.expensesMinor,
        })),
    [monthPoints, currency],
  );
  const activeGoals = useMemo(
    () => goals?.filter((g) => !g.isArchived) ?? [],
    [goals],
  );
  const activeBudgets = useMemo(
    () => budgets?.filter((b) => !b.isArchived) ?? [],
    [budgets],
  );

  if (error) {
    return (
      <div className="page">
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page analytics-page">
        <header className="analytics-header">
          <PageHeader
            title={t("reports.title")}
            subtitle={t("reports.subtitle")}
            controls={
              <SegmentedControl
                label={t("reports.period")}
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "month", label: t("reports.thisMonth") },
                  { value: "three", label: t("reports.lastThree") },
                  { value: "six", label: t("reports.lastSix") },
                ]}
              />
            }
          />
        </header>
        <SkeletonCard rows={4} />
      </div>
    );
  }

  if (!hasData && !activeBudgets.length && !activeGoals.length) {
    return (
      <div className="page analytics-page">
        <header className="analytics-header">
          <PageHeader
            title={t("reports.title")}
            subtitle={t("reports.subtitle")}
            controls={
              <SegmentedControl
                label={t("reports.period")}
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "month", label: t("reports.thisMonth") },
                  { value: "three", label: t("reports.lastThree") },
                  { value: "six", label: t("reports.lastSix") },
                ]}
              />
            }
          />
        </header>
        <EmptyState
          icon="inbox"
          title={t("reports.noData")}
          subtitle={t("reports.noDataHint")}
          action={
            <Button to="/add" icon="plus" variant="primary">
              {t("reports.emptyAddIncome")}
            </Button>
          }
        />
      </div>
    );
  }

  const monthLabel = formatMonth(range.to);

  return (
    <div className="page analytics-page">
      {/* Header */}
      <header className="analytics-header">
        <PageHeader
          title={t("reports.title")}
          subtitle={t("reports.subtitle")}
          controls={
            <>
              <SegmentedControl
                label={t("reports.period")}
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "month", label: t("reports.thisMonth") },
                  { value: "three", label: t("reports.lastThree") },
                  { value: "six", label: t("reports.lastSix") },
                ]}
              />
            </>
          }
        />
        {period === "month" && (
          <div className="analytics-month-picker">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label={t("common.month")}
              className="month-input"
            />
          </div>
        )}
      </header>

      <div className="analytics-grid">
        {/* 1. KPI Cards */}
        <section className="analytics-section">
          <h2 className="section-title">{t("reports.summaryTitle", { month: monthLabel })}</h2>
          <div className="stats-grid">
            <StatCard label={t("reports.income")} value={income} format={(v) => formatCurrency(v, currency)} tone="positive" icon="trendup" />
            <StatCard label={t("reports.expenses")} value={expenses} format={(v) => formatCurrency(v, currency)} tone="negative" icon="trenddown" />
            <StatCard label={t("reports.savings")} value={savings} format={(v) => formatCurrency(v, currency)} tone="neutral" icon="star" />
            {savingsRate !== null && (
              <StatCard
                label={t("reports.savingsRate")}
                value={savingsRate}
                format={(v) => `${v}%`}
                tone="neutral"
                icon="info"
                sub={
                  <span className="stat-sub-text">
                    {pct(savings, income)}% {t("reports.savingsRateOfIncome")}
                  </span>
                }
              />
            )}
          </div>
        </section>

        {/* 2. Income vs Expense Trend Chart */}
        <section className="analytics-section">
          <div className="section-header">
            <h2 className="section-title">{t("reports.chartTitle")}</h2>
            <span className="section-hint">{t("reports.trendHint")}</span>
          </div>
          {trendData.length > 0 ? (
            <TrendChart data={trendData} currency={currency} />
          ) : (
            <EmptyState icon="trenddown" title={t("reports.noData")} subtitle={t("reports.noTrendHint")} compact />
          )}
        </section>

        {/* 3. Period Comparison */}
        {currentCurrencyComparison && (
          <section className="analytics-section">
            <h2 className="section-title">{t("reports.vsLastMonth")}</h2>
            <div className="compare-grid">
              {[
                { label: t("reports.income"), curr: currentCurrencyComparison.currentIncomeMinor, prev: currentCurrencyComparison.previousIncomeMinor, tone: "income" as const },
                { label: t("reports.expenses"), curr: currentCurrencyComparison.currentExpensesMinor, prev: currentCurrencyComparison.previousExpensesMinor, tone: "expense" as const },
              ].map((row) => {
                const d = diffLabel(row.curr, row.prev);
                const toneClass = d
                  ? d.dir === "up"
                    ? row.tone === "expense"
                      ? "compare-diff-bad"
                      : "compare-diff-good"
                    : row.tone === "expense"
                      ? "compare-diff-good"
                      : "compare-diff-bad"
                  : "";
                return (
                  <div key={row.label} className="compare-row">
                    <span className="compare-label">{row.label}</span>
                    <span className={`compare-diff ${toneClass}`}>
                      {d ? (
                        <>
                          <Icon name={d.dir === "up" ? "trendup" : "trenddown"} size={14} />
                          {d.text} {t(`reports.direction${d.dir === "up" ? "Up" : "Down"}`)}
                        </>
                      ) : (
                        <span className="compare-same">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="analytics-sidebar">
          {/* 4. Expense Category Breakdown */}
          <section className="analytics-section">
            <h2 className="section-title">{t("reports.whereMoneyGoes")}</h2>
            {categories && categories.length > 0 ? (
              <ul className="category-list">
                {categories.map((cat) => (
                  <li key={cat.categoryId ?? "none"} className="category-item">
                    <span className="category-emoji">{categoryEmoji(cat.categoryName, "expense")}</span>
                    <div className="category-info">
                      <div className="category-top">
                        <span className="category-name">{localizeCategoryName(cat.categoryName, locale)}</span>
                        <span className="category-amount">{formatCurrency(cat.totalMinor, currency)}</span>
                      </div>
                      <ProgressBar value={cat.percentOfTotal} tone={cat.percentOfTotal >= 75 ? "danger" : cat.percentOfTotal >= 50 ? "warning" : "primary"} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="trenddown" title={t("reports.noData")} subtitle={t("reports.noDataHint")} compact />
            )}
          </section>

          {/* 5. Net Worth Trend */}
          <section className="analytics-section">
            <h2 className="section-title">{t("reports.netWorth")}</h2>
            {netWorth && netWorth.length > 0 ? (
              <div className="networth-list">
                {netWorth
                  .filter((p) => p.currency === currency)
                  .map((point) => (
                    <div key={point.month} className="networth-item">
                      <span className="networth-month">{formatMonth(point.month)}</span>
                      <span className="networth-amount">{formatCurrency(point.totalMinor, currency)}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <SkeletonBlock height={80} />
            )}
          </section>
        </div>

        {/* 6. Budget Performance */}
        <section className="analytics-section">
          <div className="section-header">
            <h2 className="section-title">{t("reports.budgets")}</h2>
          </div>
          {activeBudgets.length > 0 ? (
            <div className="budget-list">
              {activeBudgets.map((budget) => (
                <div key={budget.id} className="budget-item">
                  <div className="budget-top">
                    <span className="budget-name">{budget.categoryName}</span>
                    <Badge tone={budgetBadgeTone(budget.status)}>
                      {t(budget.status === "normal" ? "budgets.statusNormal" : budget.status === "approaching" ? "budgets.statusApproaching" : "budgets.statusExceeded")}
                    </Badge>
                  </div>
                  <div className="budget-amounts">
                    <span className="budget-spent">{formatCurrency(budget.spentMinor, currency)}</span>
                    <span className="budget-remaining"> {t("reports.remaining")}: {formatCurrency(budget.remainingMinor, currency)}</span>
                  </div>
                  <ProgressBar value={budget.percentUsed} tone={budgetStatusColor(budget.status)} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="target" title={t("budgets.empty")} subtitle={t("budgets.emptyHint")} compact />
          )}
        </section>

        {/* 7. Savings Goal Progress */}
        <section className="analytics-section">
          <div className="section-header">
            <h2 className="section-title">{t("reports.savingsGoals")}</h2>
          </div>
          {activeGoals.length > 0 ? (
            <div className="goals-list">
              {activeGoals.map((goal) => (
                <div key={goal.id} className="goal-item">
                  <div className="goal-top">
                    <span className="goal-name">{goal.name}</span>
                    <Badge tone={goal.achieved ? "success" : "neutral"}>
                      {goal.achieved ? t("savings.achieved") : `${goal.progressPercent}%`}
                    </Badge>
                  </div>
                  <div className="goal-amounts">
                    <span className="goal-current">{formatCurrency(goal.currentMinor, currency)}</span>
                    <span className="goal-target"> {t("reports.ofTarget")}: {formatCurrency(goal.targetAmountMinor, currency)}</span>
                  </div>
                  <ProgressBar value={goal.progressPercent} tone={goal.achieved ? "positive" : "primary"} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="star" title={t("savings.empty")} subtitle={t("savings.emptyHint")} compact />
          )}
        </section>
      </div>
    </div>
  );
}

/* ── Trend Chart (CSS-based bar chart, no external library) ────────────── */

interface TrendPoint {
  month: string;
  incomeMinor: number;
  expensesMinor: number;
}

function TrendChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const { t } = useI18n();
  const max = Math.max(
    ...data.map((p) => Math.max(p.incomeMinor, Math.abs(p.expensesMinor))),
    1,
  );

  return (
    <div className="trend-chart" role="img" aria-label={t("reports.chartTitle")}>
      {data.map((point) => {
        const incomeHeight = (point.incomeMinor / max) * 100;
        const expenseHeight = (Math.abs(point.expensesMinor) / max) * 100;
        const monthLabel = formatMonth(point.month).split(" ")[0];
        return (
          <div key={point.month} className="trend-col">
            <div className="trend-bars">
              {point.incomeMinor > 0 && (
                <div
                  className="trend-bar trend-bar-income"
                  style={{ height: `${incomeHeight}%` }}
                  title={`${formatCurrency(point.incomeMinor, currency)}`}
                  role="img"
                  aria-label={`${t("reports.income")}: ${formatCurrency(point.incomeMinor, currency)}`}
                />
              )}
              {point.expensesMinor !== 0 && (
                <div
                  className="trend-bar trend-bar-expense"
                  style={{ height: `${expenseHeight}%` }}
                  title={`${formatCurrency(point.expensesMinor, currency)}`}
                  role="img"
                  aria-label={`${t("reports.expenses")}: ${formatCurrency(point.expensesMinor, currency)}`}
                />
              )}
            </div>
            <span className="trend-label">{monthLabel}</span>
          </div>
        );
      })}
      <div className="trend-legend">
        <span className="trend-legend-item"><i className="trend-dot trend-dot-income" /> {t("reports.income")}</span>
        <span className="trend-legend-item"><i className="trend-dot trend-dot-expense" /> {t("reports.expenses")}</span>
      </div>
    </div>
  );
}
