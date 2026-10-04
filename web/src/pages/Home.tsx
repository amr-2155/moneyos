import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CategoryView, type DashboardView, type SavingsContributionView, type SavingsGoalView, type TransactionView } from "../lib/api";
import { currentMonth, formatCurrency, formatMonth } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { AnimatedNumber, Button, EmptyState, Input, ProgressBar, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { TransactionItem } from "../components/TransactionItem";
import { useErrorMessage } from "../lib/errors";
import { contributionsInMonth, goalKind, loadDistribution, monthlyTargets, type Distribution } from "../lib/distribution";
import { localizeCategoryName } from "../lib/categoryNames";
import { PlanEditorModal } from "../components/PlanEditor";

type Insight = { tone: "success" | "warning" | "neutral"; text: string } | null;

export function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const getError = useErrorMessage();

  const [month, setMonth] = useState(currentMonth());
  const [now, setNow] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [categories, setCategories] = useState<CategoryView[] | null>(null);
  const [goals, setGoals] = useState<SavingsGoalView[] | null>(null);
  const [contributions, setContributions] = useState<Map<string, SavingsContributionView[]> | null>(null);
  const [distribution, setDistribution] = useState<Distribution>(() => loadDistribution());
  const [planOpen, setPlanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = user?.defaultCurrency ?? "EGP";

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void api.dashboard
      .get({ month, currency })
      .then(async (dash) => {
        if (cancelled) {
          return;
        }
        setDashboard(dash);
        const [cats, goalList] = await Promise.all([api.categories.list(), api.savingsGoals.list({})]);
        if (cancelled) {
          return;
        }
        setCategories(cats);
        setGoals(goalList);
        const active = goalList.filter((goal) => !goal.isArchived);
        const byGoal = new Map<string, SavingsContributionView[]>();
        await Promise.all(
          active.map(async (goal) => {
            const list = await api.savingsGoals.contributions.list(goal.id);
            byGoal.set(goal.id, list);
          }),
        );
        if (!cancelled) {
          setContributions(byGoal);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getError(err, "errors.generic"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month, currency, getError]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const income = dashboard?.monthSummary.incomeMinor ?? 0;
  const expenses = dashboard?.monthSummary.expensesMinor ?? 0;
  const remaining = dashboard?.monthSummary.savingsMinor ?? 0;

  const targets = useMemo(() => monthlyTargets(income, distribution), [income, distribution]);

  const savingsActual = useMemo(() => {
    if (!goals || !contributions) {
      return 0;
    }
    return goals
      .filter((goal) => !goal.isArchived && goalKind(goal.name) === "savings")
      .reduce((sum, goal) => sum + contributionsInMonth(contributions.get(goal.id) ?? [], month), 0);
  }, [goals, contributions, month]);

  const investActual = useMemo(() => {
    if (!goals || !contributions) {
      return 0;
    }
    return goals
      .filter((goal) => !goal.isArchived && goalKind(goal.name) === "investment")
      .reduce((sum, goal) => sum + contributionsInMonth(contributions.get(goal.id) ?? [], month), 0);
  }, [goals, contributions, month]);

  const savingsProgress = targets.savingsMinor > 0 ? Math.min(100, (savingsActual / targets.savingsMinor) * 100) : 0;
  const investProgress = targets.investMinor > 0 ? Math.min(100, (investActual / targets.investMinor) * 100) : 0;

  const heroExpensePct = income > 0 ? Math.min(100, (expenses / income) * 100) : 0;
  const heroSavePct = income > 0 ? Math.min(100, Math.max(0, (targets.savingsMinor / income) * 100)) : 0;

  const insight = useMemo<Insight>(() => {
    if (!dashboard) {
      return null;
    }
    const summary = dashboard.monthSummary;
    if (summary.expensesMinor > summary.incomeMinor) {
      return { tone: "warning", text: t("home.insightOverspend") };
    }
    const trend = dashboard.trend;
    if (trend.length >= 2) {
      const currentPoint = trend[trend.length - 1]!;
      const previousPoint = trend[trend.length - 2]!;
      if (previousPoint.expensesMinor > 0 && currentPoint.expensesMinor !== previousPoint.expensesMinor) {
        const delta = Math.round(Math.abs((1 - currentPoint.expensesMinor / previousPoint.expensesMinor) * 100));
        if (currentPoint.expensesMinor < previousPoint.expensesMinor) {
          return { tone: "success", text: t("home.insightLower", { pct: delta }) };
        }
        return { tone: "warning", text: t("home.insightHigher", { pct: delta }) };
      }
    }
    if (targets.savingsMinor > 0) {
      if (remaining < targets.savingsMinor) {
        return { tone: "neutral", text: t("home.insightGoalLeft", { amount: formatCurrency(targets.savingsMinor - remaining, currency) }) };
      }
      return { tone: "success", text: t("home.insightGoalMet") };
    }
    return { tone: "neutral", text: t("home.insightNoData") };
  }, [dashboard, targets, remaining, currency, t]);

  const categoryName = useCallback(
    (tx: TransactionView) => {
      if (tx.type === "transfer") {
        return t("types.transfer");
      }
      const name = categories?.find((category) => category.id === tx.categoryId)?.name;
      return name ? localizeCategoryName(name, locale) : "";
    },
    [categories, t, locale],
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

  if (!dashboard || !categories || !goals || !contributions) {
    return (
      <div className="page">
        <SkeletonCard rows={6} />
      </div>
    );
  }

  const activeGoals = goals.filter((goal) => !goal.isArchived);
  const format = (value: number) => formatCurrency(value, currency);
  const planSpend = distribution.savingsPct + distribution.investPct === 100 ? 0 : 100 - distribution.savingsPct - distribution.investPct;

  const clockText = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="page home-page">
      <div className="home-now" aria-label={t("home.now")}>
        <span className="home-now-live" aria-hidden />
        <time className="home-now-time" dateTime={now.toISOString()}>
          {clockText}
        </time>
        <span className="home-now-sep" aria-hidden>
          ·
        </span>
        <span className="home-now-date">{dateText}</span>
      </div>

      <header className="home-head">
        <div>
          <h1 className="home-greeting">{t("home.greeting", { name: user?.name?.split(" ")[0] ?? "" })}</h1>
          <p className="home-status">{t("home.statusTitle", { month: formatMonth(month) })}</p>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("common.month")} className="month-input" />
      </header>

      <section className="hero" aria-label={t("home.remaining")}>
        <div className="hero-remaining">
          <span className="hero-label">{t("home.remaining")}</span>
          <strong className={`hero-amount${remaining >= 0 ? " positive" : " negative"}`}>
            <AnimatedNumber value={remaining} format={format} />
          </strong>
        </div>
        {income > 0 ? (
          <div className="hero-track" aria-hidden>
            <div className="hero-track-fill expense" style={{ width: `${heroExpensePct}%` }} />
            <div className="hero-track-fill savings" style={{ width: `${Math.min(100 - heroExpensePct, heroSavePct)}%` }} />
          </div>
        ) : null}
        <div className="hero-rows">
          <div className="hero-row">
            <span className="dot income" aria-hidden />
            <span>{t("home.income")}</span>
            <strong className="income-text">
              <AnimatedNumber value={income} format={format} />
            </strong>
          </div>
          <div className="hero-row">
            <span className="dot expense" aria-hidden />
            <span>{t("home.expenses")}</span>
            <strong className="expense-text">
              <AnimatedNumber value={expenses} format={format} />
            </strong>
          </div>
        </div>
      </section>

      <div className="home-actions">
        <Button to="/add?type=income" variant="secondary" size="lg" icon="trendup" className="action-income">
          {t("home.addIncome")}
        </Button>
        <Button to="/add?type=expense" variant="primary" size="lg" icon="trenddown" className="action-expense">
          {t("home.addExpense")}
        </Button>
      </div>

      {insight ? (
        <div className={`insight insight-${insight.tone}`} role="status">
          <Icon name={insight.tone === "warning" ? "alert" : insight.tone === "success" ? "check" : "info"} />
          <p>{insight.text}</p>
        </div>
      ) : null}

      <section className="card" aria-label={t("home.yourPlan")}>
        <div className="card-header">
          <h2>{t("home.yourPlan")}</h2>
          <button type="button" className="link" onClick={() => setPlanOpen(true)}>
            {t("home.planEdit")}
          </button>
        </div>
        <div className="plan-split">
          <div className="plan-split-track" aria-hidden>
            <div className="plan-split-fill spending" style={{ width: `${planSpend}%` }} />
            <div className="plan-split-fill savings" style={{ width: `${distribution.savingsPct}%` }} />
            <div className="plan-split-fill invest" style={{ width: `${distribution.investPct}%` }} />
          </div>
          <div className="plan-split-rows">
            <div className="plan-split-row">
              <span className="dot spending" aria-hidden />
              <span>{t("distribution.spending")} · {planSpend}%</span>
              <strong>{formatCurrency(targets.spendingMinor, currency)}</strong>
            </div>
            <div className="plan-split-row">
              <span className="dot savings" aria-hidden />
              <span>{t("distribution.savings")} · {distribution.savingsPct}%</span>
              <strong>{formatCurrency(targets.savingsMinor, currency)}</strong>
            </div>
            <div className="plan-split-row">
              <span className="dot invest" aria-hidden />
              <span>{t("distribution.investing")} · {distribution.investPct}%</span>
              <strong>{formatCurrency(targets.investMinor, currency)}</strong>
            </div>
          </div>
        </div>
        {income > 0 ? (
          <div className="plan-progress">
            <div className="plan-item">
              <div className="plan-top">
                <span>{t("home.willSave")}</span>
                <span className="plan-target">
                  {t("home.savedOf", {
                    saved: formatCurrency(Math.min(savingsActual, targets.savingsMinor), currency),
                    target: formatCurrency(targets.savingsMinor, currency),
                  })}
                </span>
              </div>
              <ProgressBar value={savingsProgress} tone="positive" />
            </div>
            <div className="plan-item">
              <div className="plan-top">
                <span>{t("home.willInvest")}</span>
                <span className="plan-target">
                  {t("home.investedOf", {
                    invested: formatCurrency(Math.min(investActual, targets.investMinor), currency),
                    target: formatCurrency(targets.investMinor, currency),
                  })}
                </span>
              </div>
              <ProgressBar value={investProgress} tone="invest" />
            </div>
          </div>
        ) : (
          <p className="sub plan-hint">{t("home.planHint")}</p>
        )}
      </section>

      <section className="card" aria-label={t("home.spendingTitle")}>
        <div className="card-header">
          <h2>{t("home.spendingTitle")}</h2>
          <Link to="/reports" className="link">
            {t("home.viewDetails")}
          </Link>
        </div>
        {dashboard.spendingByCategory.length === 0 ? (
          <EmptyState icon="trenddown" title={t("home.noExpenses")} subtitle={t("home.noExpensesHint")} compact>
            <Button to="/add?type=expense" variant="primary" size="sm" icon="plus">
              {t("home.addExpense")}
            </Button>
          </EmptyState>
        ) : (
          <ul className="spend-list">
            {dashboard.spendingByCategory.slice(0, 5).map((cat) => (
              <li key={cat.categoryId ?? "none"}>
                <div className="spend-row">
                  <span className="spend-cat">{localizeCategoryName(cat.categoryName, locale)}</span>
                  <span className="spend-val">{formatCurrency(cat.amountMinor, currency)}</span>
                </div>
                <div className="spend-track">
                  <ProgressBar value={cat.percentOfTotal} tone="primary" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label={t("home.lastTransactions")}>
        <div className="card-header">
          <h2>{t("home.lastTransactions")}</h2>
          <Link to="/transactions" className="link">
            {t("home.viewAll")}
          </Link>
        </div>
        {dashboard.recentTransactions.length === 0 ? (
          <EmptyState icon="list" title={t("home.noTransactions")} subtitle={t("home.noTransactionsHint")} compact>
            <Button to="/add" variant="primary" size="sm" icon="plus">
              {t("actions.addTransaction")}
            </Button>
          </EmptyState>
        ) : (
          <ul className="list">
            {dashboard.recentTransactions.slice(0, 4).map((tx) => (
              <TransactionItem key={tx.id} tx={tx} subtitle={categoryName(tx) || undefined} />
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label={t("home.goals")}>
        <div className="card-header">
          <h2>{t("home.goals")}</h2>
          <Link to="/goals" className="link">
            {t("home.newGoal")}
          </Link>
        </div>
        {activeGoals.length === 0 ? (
          <EmptyState icon="star" title={t("home.noGoals")} subtitle={t("home.noGoalsHint")} compact>
            <Button to="/goals" variant="primary" size="sm" icon="plus">
              {t("actions.addGoal")}
            </Button>
          </EmptyState>
        ) : (
          <ul className="home-goals">
            {activeGoals.slice(0, 3).map((goal) => (
              <li key={goal.id}>
                <span className="goal-icon" aria-hidden>
                  🎯
                </span>
                <div className="goal-main">
                  <div className="goal-top">
                    <span className="goal-name">{goal.name}</span>
                    <span className="goal-pct">{Math.min(100, goal.progressPercent).toFixed(0)}%</span>
                  </div>
                  <ProgressBar value={Math.min(goal.progressPercent, 100)} tone={goal.achieved ? "positive" : "primary"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/add" className="fab home-fab" aria-label={t("actions.addTransaction")}>
        <Icon name="plus" size={24} />
      </Link>

      <PlanEditorModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSaved={() => setDistribution(loadDistribution())}
      />
    </div>
  );
}
