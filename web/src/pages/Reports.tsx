import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DashboardView } from "../lib/api";
import { currentMonth, formatCurrency, formatMonth } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { AnimatedNumber, Button, EmptyState, Input, PageHeader, SegmentedControl, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { useErrorMessage } from "../lib/errors";
import { loadDistribution, monthlyTargets } from "../lib/distribution";
import { categoryEmoji, localizeCategoryName } from "../lib/categoryNames";

type Period = "month" | "three" | "six";

function prevMonth(month: string): string | null {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function ReportsPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const getError = useErrorMessage();

  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(currentMonth());
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [prevDashboard, setPrevDashboard] = useState<DashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const currency = user?.defaultCurrency ?? "EGP";
  const distribution = useMemo(() => loadDistribution(), []);
  const showMonth = period === "month";

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    setDashboard(null);
    setPrevDashboard(null);

    api.dashboard
      .get({ month, currency })
      .then((dash) => {
        if (cancelled) return;
        setDashboard(dash);
        const pm = prevMonth(month);
        if (pm) {
          return api.dashboard.get({ month: pm, currency });
        }
        return null;
      })
      .then((prev) => {
        if (cancelled) return;
        setPrevDashboard(prev ?? null);
        setTimeout(() => setEntered(true), 30);
      })
      .catch((err) => {
        if (!cancelled) setError(getError(err, "errors.generic"));
      });

    return () => { cancelled = true; };
  }, [month, currency, getError]);

  useEffect(() => { setEntered(false); }, [month]);
  useEffect(() => load(), [load]);

  const income = dashboard?.monthSummary.incomeMinor ?? 0;
  const expenses = dashboard?.monthSummary.expensesMinor ?? 0;
  const investTarget = monthlyTargets(income, distribution).investMinor;
  const available = Math.max(0, income - expenses - investTarget);
  const hasData = income > 0 || expenses > 0;
  const investPctVal = pct(investTarget, income);
  const expensePctVal = pct(expenses, income);
  const availablePctVal = pct(available, income);
  const categories = dashboard?.spendingByCategory ?? [];
  const trend = dashboard?.trend ?? [];

  const prevIncome = prevDashboard?.monthSummary.incomeMinor ?? 0;
  const prevExpenses = prevDashboard?.monthSummary.expensesMinor ?? 0;
  const prevInvestTarget = monthlyTargets(prevIncome, distribution).investMinor;
  const hasPrev = prevDashboard !== null && prevIncome > 0;

  function diffLabel(curr: number, prev: number): { text: string; dir: "up" | "down" } | null {
    if (prev <= 0) return null;
    const diff = Math.round(((curr - prev) / prev) * 100);
    if (diff === 0) return null;
    return { text: `${Math.abs(diff)}%`, dir: diff > 0 ? "up" : "down" };
  }

  const insight = useMemo(() => {
    if (!hasData) return t("reports.insightEmpty");
    if (income > 0 && expenses === 0) return t("reports.insightNoExpenses");
    if (income === 0 && expenses > 0) return t("reports.insightNoIncome");
    if (expensePctVal > 0) {
      const key = investPctVal > 0 ? "reports.insightExpensesPercent" : "reports.insightExpensesPercent";
      return t(key).replace("{percent}", `${expensePctVal}%`);
    }
    return t("reports.insightEmpty");
  }, [hasData, income, expenses, expensePctVal, investPctVal, t]);

  if (error) {
    return (
      <div className="page">
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="page">
        <SkeletonCard rows={5} />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="page reports-page">
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
        <div className="rp-empty">
          <div className="rp-empty-icon">👋</div>
          <h2 className="rp-empty-title">{t("reports.emptyTitle")}</h2>
          <p className="rp-empty-text">{t("reports.emptySubtitle")}</p>
          <div className="rp-empty-actions">
            <Link to="/add"><Button variant="primary" icon="plus">{t("reports.emptyAddIncome")}</Button></Link>
            <Link to="/add"><Button variant="secondary" icon="plus">{t("reports.emptyAddExpense")}</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const monthLabel = formatMonth(month);

  return (
    <div className="page reports-page">
      {/* 1. Header */}
      <div className={`rp-stagger ${entered ? "rp-entered" : ""}`} style={{ "--i": 0 } as React.CSSProperties}>
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
      </div>

      {showMonth && (
        <div className="controls controls-month rp-stagger" style={{ "--i": 1 } as React.CSSProperties}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("common.month")} className="month-input" />
        </div>
      )}

      {/* 2. Financial Summary Card */}
      <div className="rp-stagger" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="rp-summary">
          <div className="rp-summary-header">
            <span className="rp-summary-title">{t("reports.summaryTitle").replace("{month}", monthLabel)}</span>
          </div>

          <div className="rp-summary-rows">
            <div className="rp-row">
              <span className="rp-row-label"><Icon name="trendup" size={14} /> {t("reports.income")}</span>
              <span className="rp-row-value rp-income"><AnimatedNumber value={income} format={(v) => formatCurrency(v, currency)} /></span>
            </div>
            <div className="rp-row">
              <span className="rp-row-label"><Icon name="trenddown" size={14} /> {t("reports.expenses")}</span>
              <span className="rp-row-value rp-expense"><AnimatedNumber value={expenses} format={(v) => formatCurrency(v, currency)} /></span>
            </div>
            <div className="rp-row">
              <span className="rp-row-label"><Icon name="star" size={14} /> {t("reports.invest")}</span>
              <span className="rp-row-value rp-invest"><AnimatedNumber value={investTarget} format={(v) => formatCurrency(v, currency)} /></span>
            </div>
            <div className="rp-divider" />
            <div className="rp-row rp-available-row">
              <span className="rp-row-label rp-available-label">{t("reports.available")}</span>
              <span className="rp-row-value rp-available"><AnimatedNumber value={available} format={(v) => formatCurrency(v, currency)} /></span>
            </div>
          </div>

          {/* 3. Progress Bars */}
          {income > 0 && (
            <div className="rp-progress-section">
              <span className="rp-progress-title">{t("reports.progressTitle")}</span>
              <div className="rp-progress-bars">
                <div className="rp-progress-row">
                  <span className="rp-progress-label">{t("reports.expenses")} {expensePctVal}%</span>
                  <div className="rp-progress-track"><div className="rp-progress-fill rp-fill-expense" style={{ width: `${expensePctVal}%` }} /></div>
                </div>
                <div className="rp-progress-row">
                  <span className="rp-progress-label">{t("reports.invest")} {investPctVal}%</span>
                  <div className="rp-progress-track"><div className="rp-progress-fill rp-fill-invest" style={{ width: `${investPctVal}%` }} /></div>
                </div>
                <div className="rp-progress-row">
                  <span className="rp-progress-label">{t("reports.available")} {availablePctVal}%</span>
                  <div className="rp-progress-track"><div className="rp-progress-fill rp-fill-available" style={{ width: `${availablePctVal}%` }} /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Insight */}
      <div className="rp-stagger" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="rp-insight">
          <Icon name="info" size={18} className="rp-insight-icon" />
          <div className="rp-insight-content">
            <span className="rp-insight-title">{t("reports.insightTitle")}</span>
            <p className="rp-insight-text">{insight}</p>
          </div>
        </div>
      </div>

      {/* 5. Chart */}
      {(showMonth ? trend : trend).length > 0 && (
        <div className="rp-stagger" style={{ "--i": 4 } as React.CSSProperties}>
          <div className="rp-card">
            <div className="rp-card-header">
              <h2>{t("reports.chartTitle")}</h2>
            </div>
            <ReportChart
              data={showMonth
                ? [{ month, incomeMinor: income, expensesMinor: expenses }]
                : trend
              }
              currency={currency}
              showInvest={investTarget > 0}
              investData={showMonth
                ? [{ month, investMinor: investTarget }]
                : trend.map((p) => ({ month: p.month, investMinor: monthlyTargets(p.incomeMinor, distribution).investMinor }))
              }
            />
            <div className="rp-legend">
              <span className="rp-legend-item"><i className="rp-legend-dot rp-dot-income" /> {t("reports.income")}</span>
              <span className="rp-legend-item"><i className="rp-legend-dot rp-dot-expense" /> {t("reports.expenses")}</span>
              {investTarget > 0 && <span className="rp-legend-item"><i className="rp-legend-dot rp-dot-invest" /> {t("reports.invest")}</span>}
            </div>
          </div>
        </div>
      )}

      {/* 6. Spending by Category */}
      {categories.length > 0 && (
        <div className="rp-stagger" style={{ "--i": 5 } as React.CSSProperties}>
          <div className="rp-card">
            <div className="rp-card-header">
              <h2>{t("reports.whereMoneyGoes")}</h2>
            </div>
            <ul className="rp-cat-list">
              {categories.slice(0, 6).map((cat) => (
                <li key={cat.categoryId ?? "none"} className="rp-cat-item">
                  <span className="rp-cat-emoji">{categoryEmoji(cat.categoryName, "expense")}</span>
                  <div className="rp-cat-info">
                    <div className="rp-cat-top">
                      <span className="rp-cat-name">{localizeCategoryName(cat.categoryName, locale)}</span>
                      <span className="rp-cat-amount">{formatCurrency(cat.amountMinor, currency)}</span>
                    </div>
                    <div className="rp-progress-track"><div className="rp-progress-fill rp-fill-category" style={{ width: `${cat.percentOfTotal}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Empty category state */}
      {categories.length === 0 && expenses > 0 && (
        <div className="rp-stagger" style={{ "--i": 5 } as React.CSSProperties}>
          <div className="rp-card">
            <div className="rp-card-header">
              <h2>{t("reports.byCategory")}</h2>
            </div>
            <EmptyState icon="trenddown" title={t("reports.noData")} subtitle={t("reports.noDataHint")} compact />
          </div>
        </div>
      )}

      {/* 7. Investment Card */}
      {investTarget > 0 && (
        <div className="rp-stagger" style={{ "--i": 6 } as React.CSSProperties}>
          <div className="rp-card rp-invest-card">
            <div className="rp-invest-top">
              <Icon name="star" size={18} className="rp-invest-icon" />
              <div className="rp-invest-info">
                <span className="rp-invest-label">{t("reports.investmentCard")}</span>
                <span className="rp-invest-amount">{formatCurrency(investTarget, currency)}</span>
              </div>
              <span className="rp-invest-pct">{t("reports.investmentPercent").replace("{percent}", `${investPctVal}%`)}</span>
            </div>
            <div className="rp-progress-track rp-progress-track-lg">
              <div className="rp-progress-fill rp-fill-invest" style={{ width: `${investPctVal}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* 8. Month Comparison */}
      {hasPrev && (
        <div className="rp-stagger" style={{ "--i": 7 } as React.CSSProperties}>
          <div className="rp-card">
            <div className="rp-card-header">
              <h2>{t("reports.vsLastMonth")}</h2>
            </div>
            <div className="rp-compare">
              {[ 
                { label: t("reports.income"), curr: income, prev: prevIncome, tone: "income" },
                { label: t("reports.expenses"), curr: expenses, prev: prevExpenses, tone: "expense" },
                { label: t("reports.invest"), curr: investTarget, prev: prevInvestTarget, tone: "invest" },
              ].map((row) => {
                const d = diffLabel(row.curr, row.prev);
                return (
                  <div key={row.label} className="rp-compare-row">
                    <span className="rp-compare-label">{row.label}</span>
                    <span className={`rp-compare-diff ${d ? (d.dir === "up" ? (row.tone === "expense" ? "rp-diff-bad" : "rp-diff-good") : (row.tone === "expense" ? "rp-diff-good" : "rp-diff-bad")) : ""}`}>
                      {d ? (
                        <>
                          <Icon name={d.dir === "up" ? "trendup" : "trenddown"} size={14} />
                          {d.text} {t(`reports.direction${d.dir === "up" ? "Up" : "Down"}`)}
                        </>
                      ) : (
                        <span className="rp-compare-same">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 12. Quick Actions */}
      <div className="rp-stagger" style={{ "--i": 8 } as React.CSSProperties}>
        <div className="rp-actions">
          <Link to="/add" className="rp-action-btn rp-action-income">
            <Icon name="plus" size={16} />
            {t("reports.quickAddIncome")}
          </Link>
          <Link to="/add" className="rp-action-btn rp-action-expense">
            <Icon name="minus" size={16} />
            {t("reports.quickAddExpense")}
          </Link>
          <Link to="/goals" className="rp-action-btn rp-action-invest">
            <Icon name="target" size={16} />
            {t("reports.quickAddInvest")}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Chart ────────────────────────────────────────────── */

function ReportChart({
  data,
  currency,
  showInvest,
  investData,
}: {
  data: { month: string; incomeMinor: number; expensesMinor: number }[];
  currency: string;
  showInvest: boolean;
  investData: { month: string; investMinor: number }[];
}) {
  const { t } = useI18n();
  const max = Math.max(
    ...data.map((p) => Math.max(p.incomeMinor, p.expensesMinor)),
    ...investData.map((p) => p.investMinor),
    1,
  );

  const investMap = useMemo(() => {
    const m: Record<string, number> = {};
    investData.forEach((p) => { m[p.month] = p.investMinor; });
    return m;
  }, [investData]);

  return (
    <div className="rp-chart" role="img" aria-label={t("reports.chartTitle")}>
      {data.map((point) => (
        <div key={point.month} className="rp-chart-col">
          <div className="rp-chart-bars">
            <div className="rp-chart-bar rp-bar-income" style={{ height: `${(point.incomeMinor / max) * 100}%` }} title={formatCurrency(point.incomeMinor, currency)} />
            <div className="rp-chart-bar rp-bar-expense" style={{ height: `${(point.expensesMinor / max) * 100}%` }} title={formatCurrency(point.expensesMinor, currency)} />
            {showInvest && (
              <div className="rp-chart-bar rp-bar-invest" style={{ height: `${((investMap[point.month] ?? 0) / max) * 100}%` }} title={formatCurrency(investMap[point.month] ?? 0, currency)} />
            )}
          </div>
          <span className="rp-chart-label">{formatMonth(point.month).split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}
