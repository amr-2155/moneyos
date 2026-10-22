import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AccountView, type CategoryView, type RecurringRuleView } from "../lib/api";
import { useI18n } from "../i18n";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { DateField } from "../components/DateField";
import { formatCurrency, formatDateLong } from "../lib/format";
import { localizeCategoryName } from "../lib/categoryNames";
import { haptic } from "../lib/haptics";
import { today, type Frequency } from "../lib/recurring";

const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];
const REMIND_OPTIONS = [0, 1, 3, 5, 7];

export function RecurringPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [rules, setRules] = useState<RecurringRuleView[] | null>(null);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringRuleView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);

  const currency = user?.defaultCurrency ?? "EGP";

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.recurring.list(), api.accounts.list(), api.categories.list()])
      .then(([ruleList, accountList, categoryList]) => {
        setRules(ruleList);
        setAccounts(accountList);
        setCategories(categoryList);
      })
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [getError]);

  useEffect(() => load(), [load]);

  const totals = useMemo(() => {
    const monthlyExpenses = rules
      ?.filter((rule) => rule.type === "expense")
      .reduce((sum, rule) => sum + monthlyWeight(rule) * rule.amountMinor, 0) ?? 0;
    const monthlyIncome =
      rules
        ?.filter((rule) => rule.type === "income")
        .reduce((sum, rule) => sum + monthlyWeight(rule) * rule.amountMinor, 0) ?? 0;
    return { monthlyExpenses, monthlyIncome };
  }, [rules]);

  /** Normalises a rule's amount to a per-month figure for the summary. */
  function monthlyWeight(rule: RecurringRuleView): number {
    if (rule.frequency === "monthly") return 1;
    if (rule.frequency === "yearly") return 1 / 12;
    return 52 / 12;
  }

  async function onRunNow() {
    setRunning(true);
    try {
      const created = await api.recurring.materialiseAll();
      haptic(created > 0 ? "success" : "light");
      show("success", created > 0 ? t("recurring.added", { count: String(created) }) : t("recurring.upToDate"));
      load();
    } catch (err) {
      haptic("error");
      show("error", getError(err, "errors.generic"));
    } finally {
      setRunning(false);
    }
  }

  function onDeleted() {
    if (!deleteTarget) return;
    setDeleting(true);
    api.recurring
      .remove(deleteTarget.id)
      .then((removed) => {
        haptic("medium");
        show("success", t("recurring.deleted"), {
          action: {
            label: t("common.undo"),
            onAction: () => {
              api.recurring
                .restore(removed)
                .then(() => {
                  show("success", t("common.restore"));
                  load();
                })
                .catch((err) => show("error", getError(err, "errors.generic")));
            },
          },
        });
        setDeleteTarget(null);
        setDeleting(false);
        load();
      })
      .catch((err) => {
        setDeleting(false);
        show("error", getError(err, "errors.generic"));
      });
  }

  const renderRule = (rule: RecurringRuleView) => {
    const due = rule.nextDueDate;
    const overdue = due !== null && due <= today();
    return (
      <li className="list-item recurring-row" key={rule.id}>
        <span className={`recurring-icon${rule.type === "income" ? " income" : ""}`} aria-hidden>
          <Icon name="refresh" size={18} />
        </span>
        <div className="recurring-main">
          <div className="recurring-top">
            <span className="recurring-name">{rule.name}</span>
            <span className={`recurring-amount ${rule.type === "income" ? "income-text" : "expense-text"}`}>
              {rule.type === "income" ? "+" : "−"}
              {formatCurrency(rule.amountMinor, currency)}
            </span>
          </div>
          <div className="recurring-meta">
            <span>{t(`recurring.frequency.${rule.frequency}`)}</span>
            {rule.categoryName ? <span>· {localizeCategoryName(rule.categoryName, locale)}</span> : null}
          </div>
          {due ? (
            <div className={`recurring-next${overdue ? " is-due" : ""}`}>
              <Icon name="clock" size={14} />
              <span>
                {overdue ? t("recurring.due") : t("recurring.next")} {formatDateLong(due)}
              </span>
            </div>
          ) : (
            <div className="recurring-next">
              <span>{t("recurring.finished")}</span>
            </div>
          )}
        </div>
        <div className="recurring-actions">
          <Badge tone={rule.type === "income" ? "success" : "primary"}>
            {t(`recurring.frequency.${rule.frequency}`)}
          </Badge>
          <Button variant="ghost" size="sm" icon="trash" aria-label={t("common.delete")} onClick={() => setDeleteTarget(rule)}>
            {t("common.delete")}
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title={t("recurring.title")}
        subtitle={t("recurring.subtitle")}
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={() => void onRunNow()} loading={running}>
              {t("recurring.runNow")}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)} disabled={accounts.length === 0}>
              {t("recurring.add")}
            </Button>
          </>
        }
      />

      {error ? (
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      ) : rules === null ? (
        <SkeletonCard rows={4} />
      ) : rules.length === 0 ? (
        <EmptyState icon="refresh" title={t("recurring.empty")} subtitle={t("recurring.emptyHint")}>
          {accounts.length > 0 ? (
            <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
              {t("recurring.add")}
            </Button>
          ) : (
            <span className="muted">{t("recurring.needAccount")}</span>
          )}
        </EmptyState>
      ) : (
        <div className="page-stack">
          <section className="card recurring-summary" aria-label={t("recurring.summary")}>
            <div className="recurring-summary-item">
              <span className="recurring-summary-label">{t("recurring.monthlyIn")}</span>
              <strong className="income-text">{formatCurrency(totals.monthlyIncome, currency)}</strong>
            </div>
            <div className="recurring-summary-item">
              <span className="recurring-summary-label">{t("recurring.monthlyOut")}</span>
              <strong className="expense-text">{formatCurrency(totals.monthlyExpenses, currency)}</strong>
            </div>
            <div className="recurring-summary-item">
              <span className="recurring-summary-label">{t("recurring.netMonthly")}</span>
              <strong className={totals.monthlyIncome - totals.monthlyExpenses >= 0 ? "income-text" : "expense-text"}>
                {formatCurrency(totals.monthlyIncome - totals.monthlyExpenses, currency)}
              </strong>
            </div>
          </section>

          <ul className="list">{rules.map(renderRule)}</ul>
        </div>
      )}

      {formOpen ? (
        <RecurringFormModal
          accounts={accounts}
          categories={categories}
          currency={currency}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            haptic("success");
            load();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t("recurring.deleteTitle")}
          message={t("recurring.deleteConfirm", { name: deleteTarget.name })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("actions.cancel")}
          tone="danger"
          loading={deleting}
          onConfirm={() => void onDeleted()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}

function RecurringFormModal({
  accounts,
  categories,
  currency,
  onClose,
  onSaved,
}: {
  accounts: AccountView[];
  categories: CategoryView[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [remind, setRemind] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relevantCategories = categories.filter((category) => category.type === type || category.type === "both");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t("recurring.nameRequired"));
      return;
    }
    if (!amount || Number.parseFloat(amount) <= 0) {
      setError(t("recurring.amountRequired"));
      return;
    }
    setSaving(true);
    try {
      await api.recurring.create({
        name: name.trim(),
        accountId,
        categoryId: categoryId || null,
        type,
        amount,
        frequency,
        startDate,
        endDate: endDate || null,
        remindDaysBefore: remind,
      });
      show("success", t("recurring.created"));
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("recurring.add")} onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <Field label={t("recurring.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("recurring.namePlaceholder")} autoFocus required />
        </Field>

        <Field label={t("recurring.type")}>
          <div className="segmented">
            <button
              type="button"
              className={`segmented-btn expense${type === "expense" ? " active" : ""}`}
              aria-pressed={type === "expense"}
              onClick={() => setType("expense")}
            >
              {t("types.expense")}
            </button>
            <button
              type="button"
              className={`segmented-btn income${type === "income" ? " active" : ""}`}
              aria-pressed={type === "income"}
              onClick={() => setType("income")}
            >
              {t("types.income")}
            </button>
          </div>
        </Field>

        <Field label={t("common.amount")} hint={currency}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        </Field>

        <Field label={t("recurring.frequencyLabel")}>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQUENCIES.map((option) => (
              <option key={option} value={option}>
                {t(`recurring.frequency.${option}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("common.account")}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        {relevantCategories.length > 0 ? (
          <Field label={t("common.category")}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("categories.noCategory")}</option>
              {relevantCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label={t("recurring.startDate")}>
          <DateField value={startDate} onChange={setStartDate} formatValue={formatDateLong} emptyHint={t("recurring.startHint")} required />
        </Field>

        <Field label={t("recurring.remind")}>
          <Select value={String(remind)} onChange={(e) => setRemind(Number(e.target.value))}>
            {REMIND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 0 ? t("recurring.remindNone") : t("recurring.remindDays", { count: String(option) })}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("recurring.endDate")} hint={t("recurring.endHint")}>
          <DateField value={endDate} onChange={setEndDate} formatValue={formatDateLong} emptyHint={t("recurring.endOptional")} min={startDate} />
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