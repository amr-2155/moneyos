import { useCallback, useEffect, useState } from "react";
import { api, type SavingsGoalView } from "../lib/api";
import { CURRENCIES, formatCurrency, formatMonth, minorToDecimal } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { AnimatedNumber, Badge, Button, ConfirmDialog, EmptyState, Field, FieldRow, Input, Modal, PageHeader, ProgressBar, Select, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";

export function SavingsGoalsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [goals, setGoals] = useState<SavingsGoalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoalView | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SavingsGoalView | null>(null);
  const [contributingTo, setContributingTo] = useState<SavingsGoalView | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.savingsGoals
      .list({})
      .then(setGoals)
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [getError]);

  useEffect(() => load(), [load]);

  function onArchived() {
    if (!archiveTarget) {
      return;
    }
    api.savingsGoals
      .archive(archiveTarget.id)
      .then(() => {
        show("success", t("savings.archived"));
        setArchiveTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  return (
    <div className="page">
      <PageHeader
        title={t("nav.goals")}
        subtitle={goals ? t("common.count", { count: String(goals.length) }) : undefined}
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("actions.addGoal")}
          </Button>
        }
      />

      {error ? (
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      ) : goals === null ? (
        <SkeletonCard rows={4} />
      ) : goals.length === 0 ? (
        <EmptyState icon="star" title={t("savings.empty")} subtitle={t("savings.emptyHint")}>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("actions.addGoal")}
          </Button>
        </EmptyState>
      ) : (
        <div className="goal-grid">
          {goals.map((goal) => (
            <section className={`card goal-card${goal.isArchived ? " muted" : ""}`} key={goal.id}>
              <div className="goal-card-top">
                <span className="goal-icon">
                  <Icon name="star" />
                </span>
                <div className="goal-card-title">
                  <div className="goal-card-name">{goal.name}</div>
                  <div className="goal-card-currency">{goal.currency}</div>
                </div>
                {goal.achieved ? <Badge tone="success">{t("savings.achieved")}</Badge> : null}
              </div>
              <div className="goal-card-progress">
                <ProgressBar value={Math.min(goal.progressPercent, 100)} tone={goal.achieved ? "positive" : "primary"} />
                <div className="goal-card-progress-label">
                  <span>
                    <AnimatedNumber value={goal.currentMinor} format={(v) => formatCurrency(v, goal.currency)} /> /{" "}
                    {formatCurrency(goal.targetAmountMinor, goal.currency)}
                  </span>
                  <span>{goal.progressPercent.toFixed(0)}%</span>
                </div>
              </div>
              {goal.targetDate ? (
                <p className="goal-card-date">{formatMonth(goal.targetDate.slice(0, 7))}</p>
              ) : null}
              {goal.estimates.requiredMonthlyMinor !== null ? (
                <p className="goal-card-estimate">
                  {t("savings.requiredMonthly", { amount: formatCurrency(goal.estimates.requiredMonthlyMinor, goal.currency) })}
                </p>
              ) : null}
              {goal.estimates.completionMonth ? (
                <p className="goal-card-estimate">
                  {t("savings.completionMonth", { month: formatMonth(goal.estimates.completionMonth) })}
                </p>
              ) : null}
              <div className="goal-actions">
                <Button variant="secondary" size="sm" icon="plus" onClick={() => setContributingTo(goal)}>
                  {t("actions.contribute")}
                </Button>
                <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(goal)}>
                  {t("common.edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(goal)}>
                  {t("common.archive")}
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}

      {formOpen ? (
        <GoalFormModal
          editing={editing}
          defaultCurrency={user?.defaultCurrency ?? "EGP"}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {contributingTo ? (
        <ContributionModal
          goal={contributingTo}
          onClose={() => setContributingTo(null)}
          onSaved={() => {
            setContributingTo(null);
            load();
          }}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title={t("savings.archiveTitle")}
          message={t("savings.archiveConfirm", { name: archiveTarget.name })}
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

function GoalFormModal({
  editing,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  editing: SavingsGoalView | null;
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [name, setName] = useState(editing?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(editing ? minorToDecimal(editing.targetAmountMinor, editing.currency) : "");
  const [currency, setCurrency] = useState(editing?.currency ?? defaultCurrency);
  const [targetDate, setTargetDate] = useState(editing?.targetDate?.slice(0, 10) ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [currentAmount, setCurrentAmount] = useState(editing ? minorToDecimal(editing.currentMinor, editing.currency) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(targetAmount);
    if (!name.trim()) {
      setError(t("savings.name") + " " + t("transactions.requiredFields"));
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
        await api.savingsGoals.update(editing.id, {
          name: name.trim(),
          targetAmount,
          targetDate: targetDate || null,
          description: description || undefined,
        });
        show("success", t("savings.updated"));
      } else {
        await api.savingsGoals.create({
          name: name.trim(),
          targetAmount,
          currency,
          targetDate: targetDate || null,
          description: description || undefined,
          currentAmount: currentAmount.trim() || undefined,
        });
        show("success", t("savings.created"));
      }
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? t("common.edit") : t("actions.addGoal")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Field label={t("savings.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!editing} required />
        </Field>
        <FieldRow>
          <Field label={t("savings.targetAmount")}>
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required />
          </Field>
          <Field label={t("savings.currency")}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!!editing}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        {!editing ? (
          <Field label={t("savings.currentAmount")}>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} placeholder="0.00" />
          </Field>
        ) : null}
        <Field label={t("savings.targetDate")}>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label={t("savings.description")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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

function ContributionModal({ goal, onClose, onSaved }: { goal: SavingsGoalView; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!numeric || numeric <= 0) {
      setError(t("transactions.amountRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.savingsGoals.contributions.add(goal.id, { amount, note: note.trim() || undefined });
      show("success", t("savings.contributed"));
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("savings.contributeTitle", { name: goal.name })} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Field label={t("savings.contributionAmount")} hint={goal.currency}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
        </Field>
        <Field label={t("savings.contributionNote")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
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
            {t("actions.contribute")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

