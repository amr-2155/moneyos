import { useEffect, useState } from "react";
import { currentMonth, formatCurrency } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { Button, Field, FieldRow, Input, Modal } from "./ui";
import { useToast } from "./Toast";
import { useErrorMessage } from "../lib/errors";
import { api } from "../lib/api";
import { DEFAULT_DISTRIBUTION, loadDistribution, monthlyTargets, saveDistribution, spendingPct } from "../lib/distribution";

/**
 * Edits the user's monthly money plan (spending / savings / investing split).
 * Used from the home dashboard and from Settings.
 */
export function PlanEditorModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [savingsPct, setSavingsPct] = useState<number>(() => loadDistribution().savingsPct);
  const [investPct, setInvestPct] = useState<number>(() => loadDistribution().investPct);
  const [income, setIncome] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = user?.defaultCurrency ?? "EGP";

  useEffect(() => {
    if (!open) {
      return;
    }
    const current = loadDistribution();
    setSavingsPct(current.savingsPct);
    setInvestPct(current.investPct);
    setError(null);
    let cancelled = false;
    api.dashboard
      .get({ month: currentMonth(), currency })
      .then((dash) => {
        if (!cancelled) {
          setIncome(dash.monthSummary.incomeMinor);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, currency]);

  const totalPct = savingsPct + investPct;
  const spend = spendingPct({ savingsPct, investPct });
  const targets = monthlyTargets(income ?? 0, { savingsPct, investPct });
  const isRecommended = savingsPct === DEFAULT_DISTRIBUTION.savingsPct && investPct === DEFAULT_DISTRIBUTION.investPct;

  async function onSave() {
    if (totalPct > 100) {
      setError(t("distribution.needsHundred"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      saveDistribution({ savingsPct, investPct });
      show("success", t("home.planSaved"));
      onSaved?.();
      onClose();
    } catch (err) {
      show("error", getError(err, "errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <Modal title={t("distribution.title")} onClose={onClose}>
      <p className="sub">{t("distribution.hint")}</p>
      <FieldRow>
        <Field label={t("distribution.savings")} hint={t("distribution.savingsHint")}>
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            value={Number.isNaN(savingsPct) ? "" : savingsPct}
            onChange={(e) => setSavingsPct(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label={t("distribution.investing")} hint={t("distribution.investingHint")}>
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            value={Number.isNaN(investPct) ? "" : investPct}
            onChange={(e) => setInvestPct(Number(e.target.value) || 0)}
          />
        </Field>
      </FieldRow>
      <p className="sub">
        {t("distribution.spending")}: {spend}%
      </p>
      {isRecommended ? <p className="hint-note">{t("distribution.suggestion")}</p> : null}
      {income !== null ? (
        <p className="sub">
          {t("distribution.example", {
            income: formatCurrency(income, currency),
            spend: formatCurrency(targets.spendingMinor, currency),
            save: formatCurrency(targets.savingsMinor, currency),
            invest: formatCurrency(targets.investMinor, currency),
          })}
        </p>
      ) : null}
      {error ? (
        <div className="error-note" role="alert">
          {error}
        </div>
      ) : null}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          {t("actions.cancel")}
        </Button>
        <Button variant="primary" loading={saving} onClick={() => void onSave()}>
          {t("actions.save")}
        </Button>
      </div>
    </Modal>
  );
}
