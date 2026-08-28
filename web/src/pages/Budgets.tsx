import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type BudgetStatus, type BudgetView, type CategoryView } from "../lib/api";
import { currentMonth, formatCurrency, minorToDecimal } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n, type TranslationKey } from "../i18n";
import { AnimatedNumber, Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, Select, SkeletonCard, StatCard } from "../components/ui";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { localizeCategoryName } from "../lib/categoryNames";

const STATUS_LABEL: Record<BudgetStatus, TranslationKey> = {
  normal: "budgets.statusNormal",
  approaching: "budgets.statusApproaching",
  exceeded: "budgets.statusExceeded",
};

const WARNING_OPTIONS = [50, 75, 90];

export function BudgetsPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [period, setPeriod] = useState(currentMonth());
  const [budgets, setBudgets] = useState<BudgetView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetView | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BudgetView | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.budgets
      .list({ period })
      .then(setBudgets)
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [period, getError]);

  useEffect(() => load(), [load]);

  const summary = useMemo(() => {
    if (!budgets) {
      return null;
    }
    const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amountMinor, 0);
    const totalSpent = budgets.reduce((sum, budget) => sum + budget.spentMinor, 0);
    return {
      totalBudgeted,
      totalSpent,
      totalRemaining: totalBudgeted - totalSpent,
      currency: budgets[0]?.currency ?? "USD",
    };
  }, [budgets]);

  function onArchived() {
    if (!archiveTarget) {
      return;
    }
    api.budgets
      .archive(archiveTarget.id)
      .then(() => {
        show("success", t("budgets.archived"));
        setArchiveTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  return (
    <div className="page">
      <PageHeader
        title={t("nav.budgets")}
        controls={
          <div className="controls">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("common.month")} />
          </div>
        }
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("actions.addBudget")}
          </Button>
        }
      />

      {error ? (
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      ) : budgets === null || !summary ? (
        <SkeletonCard rows={6} />
      ) : budgets.length === 0 ? (
        <EmptyState icon="target" title={t("budgets.empty")} subtitle={t("budgets.emptyHint")}>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("actions.addBudget")}
          </Button>
        </EmptyState>
      ) : (
        <>
          <section className="card" aria-label={t("budgets.summaryTitle")}>
            <div className="card-header">
              <h2>{t("budgets.summaryTitle")}</h2>
            </div>
            <div className="stat-grid">
              <StatCard label={t("budgets.summaryBudgeted")} value={summary.totalBudgeted} format={(v) => formatCurrency(v, summary.currency)} tone="neutral" icon="target" />
              <StatCard label={t("budgets.summarySpent")} value={summary.totalSpent} format={(v) => formatCurrency(v, summary.currency)} tone="negative" icon="trenddown" />
              <StatCard label={t("budgets.summaryRemaining")} value={summary.totalRemaining} format={(v) => formatCurrency(v, summary.currency)} tone={summary.totalRemaining >= 0 ? "positive" : "negative"} icon="wallet" />
            </div>
          </section>

          <section className="card" aria-label={t("nav.budgets")}>
            <div className="card-header">
              <h2>{t("nav.budgets")}</h2>
            </div>
            <ul className="list">
              {budgets.map((budget) => {
                const tone: "primary" | "warning" | "danger" = budget.status === "normal" ? "primary" : budget.status === "approaching" ? "warning" : "danger";
                return (
                  <li className="budget-row" key={budget.id}>
                    <div className="budget-top">
                      <span className="budget-name">{localizeCategoryName(budget.categoryName, locale)}</span>
                      <Badge tone={tone}>{t(STATUS_LABEL[budget.status])}</Badge>
                    </div>
                    <ProgressBar value={Math.min(budget.percentUsed, 100)} tone={tone} />
                    <div className="budget-sub">
                      <span>
                        <AnimatedNumber value={budget.spentMinor} format={(v) => formatCurrency(v, budget.currency)} /> /{" "}
                        {formatCurrency(budget.amountMinor, budget.currency)}
                      </span>
                      <span>{budget.percentUsed.toFixed(0)}%</span>
                    </div>
                    <div className="budget-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        onClick={() => {
                          setEditing(budget);
                          setFormOpen(true);
                        }}
                      >
                        {t("common.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(budget)}>
                        {t("common.archive")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {formOpen ? (
        <BudgetFormModal
          editing={editing}
          period={period}
          defaultCurrency={user?.defaultCurrency ?? "EGP"}
          existingCategoryIds={budgets?.map((budget) => budget.categoryId) ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title={t("budgets.archiveTitle")}
          message={t("budgets.archiveConfirm", { category: localizeCategoryName(archiveTarget.categoryName, locale) })}
          confirmLabel={t("actions.confirm")}
          cancelLabel={t("actions.cancel")}
          tone="danger"
          onConfirm={() => void onArchived()}
          onCancel={() => setArchiveTarget(null)}
        />
      ) : null}
    </div>
  );
}

function BudgetFormModal({
  editing,
  period,
  defaultCurrency,
  existingCategoryIds,
  onClose,
  onSaved,
}: {
  editing: BudgetView | null;
  period: string;
  defaultCurrency: string;
  existingCategoryIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [amount, setAmount] = useState(editing ? minorToDecimal(editing.amountMinor, editing.currency) : "");
  const [warnAt, setWarnAt] = useState(editing?.warningThresholdPercent ?? 75);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.categories
      .list()
      .then((cats) => {
        if (!cancelled) {
          setCategories(cats);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const available = categories.filter(
    (category) => !category.isArchived && (category.type === "expense" || category.type === "both") && (category.id === editing?.categoryId || !existingCategoryIds.includes(category.id)),
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!categoryId) {
      setError(t("budgets.category") + " " + t("transactions.requiredFields"));
      return;
    }
    if (!numeric || numeric <= 0) {
      setError(t("transactions.amountRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await api.budgets.update(editing.id, { amount, warningThresholdPercent: warnAt });
        show("success", t("budgets.updated"));
      } else {
        await api.budgets.create({
          categoryId,
          amount,
          currency: defaultCurrency,
          period,
          warningThresholdPercent: warnAt,
        });
        show("success", t("budgets.created"));
      }
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? t("common.edit") : t("actions.addBudget")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        {!editing ? (
          <Field label={t("budgets.category")}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">{t("common.select")}</option>
              {available.map((category) => (
                <option key={category.id} value={category.id}>
                  {localizeCategoryName(category.name, locale)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={t("budgets.category")}>
            <Input value={localizeCategoryName(editing.categoryName, locale)} disabled />
          </Field>
        )}
        <Field label={t("budgets.amount")} hint={defaultCurrency}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing} required />
        </Field>
        <Field label={t("budgets.warnAt")} hint={t("budgets.warnHint")}>
          <Select value={String(warnAt)} onChange={(e) => setWarnAt(Number(e.target.value))}>
            {WARNING_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </Select>
        </Field>
        {error ? (
          <div className="error-note" role="alert">
            {error}
          </div>
        ) : null}
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
