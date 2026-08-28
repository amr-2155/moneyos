import { useCallback, useEffect, useState } from "react";
import { api, type AccountView } from "../lib/api";
import { CURRENCIES, formatCurrency } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n, type TranslationKey } from "../i18n";
import { AnimatedNumber, Badge, Button, ConfirmDialog, EmptyState, Field, FieldRow, Input, Modal, PageHeader, Select, SkeletonCard } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";

const ACCOUNT_TYPES: { value: string; icon: IconName; label: TranslationKey }[] = [
  { value: "cash", icon: "cash", label: "accounts.typeCash" },
  { value: "bank", icon: "bank", label: "accounts.typeBank" },
  { value: "mobile_wallet", icon: "card", label: "accounts.typeWallet" },
  { value: "credit_card", icon: "card", label: "accounts.typeCard" },
  { value: "savings", icon: "star", label: "accounts.typeSavings" },
  { value: "investment", icon: "trendup", label: "accounts.typeInvestment" },
  { value: "other", icon: "wallet", label: "accounts.typeOther" },
];

const ACCOUNT_ICON: Record<string, IconName> = Object.fromEntries(
  ACCOUNT_TYPES.map((accountType) => [accountType.value, accountType.icon]),
) as Record<string, IconName>;

function accountTypeLabel(type: string): TranslationKey {
  return ACCOUNT_TYPES.find((accountType) => accountType.value === type)?.label ?? "accounts.typeOther";
}

export function AccountsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AccountView | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.accounts
      .list()
      .then(setAccounts)
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [getError]);

  useEffect(() => load(), [load]);

  function onArchived() {
    if (!archiveTarget) {
      return;
    }
    api.accounts
      .archive(archiveTarget.id)
      .then(() => {
        show("success", t("accounts.archived"));
        setArchiveTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  function onActivated(account: AccountView) {
    api.accounts
      .activate(account.id)
      .then(() => {
        show("success", t("accounts.activated"));
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  return (
    <div className="page">
      <PageHeader
        title={t("nav.accounts")}
        subtitle={accounts ? t("common.count", { count: String(accounts.length) }) : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addAccount")}
          </Button>
        }
      />

      {error ? (
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      ) : accounts === null ? (
        <SkeletonCard rows={5} />
      ) : accounts.length === 0 ? (
        <EmptyState icon="wallet" title={t("accounts.empty")} subtitle={t("accounts.emptyHint")}>
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addAccount")}
          </Button>
        </EmptyState>
      ) : (
        <div className="account-grid">
          {accounts.map((account) => (
            <section className={`card account-card${account.isActive ? "" : " muted"}`} key={account.id}>
              <div className="account-top">
                <span className="account-icon">
                  <Icon name={ACCOUNT_ICON[account.type] ?? "wallet"} />
                </span>
                <div className="account-main">
                  <div className="account-name">{account.name}</div>
                  <div className="account-type">{t(accountTypeLabel(account.type))}</div>
                </div>
                {!account.isActive ? <Badge tone="neutral">{t("accounts.archived")}</Badge> : null}
                <div className="account-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    onClick={() => {
                      setEditing(account);
                      setFormOpen(true);
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  {account.isActive ? (
                    <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(account)}>
                      {t("common.archive")}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => void onActivated(account)}>
                      {t("common.activate")}
                    </Button>
                  )}
                </div>
              </div>
              <div className="account-balance">
                <AnimatedNumber value={account.balanceMinor} format={(v) => formatCurrency(v, account.currency)} />
              </div>
            </section>
          ))}
        </div>
      )}

      {formOpen ? (
        <AccountFormModal
          editing={editing}
          defaultCurrency={user?.defaultCurrency ?? "EGP"}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {archiveTarget ? (
        <ConfirmDialog
          title={t("accounts.archiveTitle")}
          message={t("accounts.archiveConfirm", { name: archiveTarget.name })}
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

function AccountFormModal({
  editing,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  editing: AccountView | null;
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "bank");
  const [currency, setCurrency] = useState(editing?.currency ?? defaultCurrency);
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("accounts.nameRequired"));
      return;
    }
    if (!editing && openingBalance.trim() !== "" && Number(openingBalance) < 0) {
      setError(t("accounts.negativeBalance"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await api.accounts.update(editing.id, { name: name.trim(), type });
        show("success", t("accounts.updated"));
      } else {
        await api.accounts.create({ name: name.trim(), type, currency, openingBalance: openingBalance.trim() || "0" });
        show("success", t("accounts.created"));
      }
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? t("common.edit") : t("actions.addAccount")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Field label={t("common.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label={t("common.type")}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((accountType) => (
              <option key={accountType.value} value={accountType.value}>
                {t(accountType.label)}
              </option>
            ))}
          </Select>
        </Field>
        {!editing ? (
          <FieldRow>
            <Field label={t("common.currency")}>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("accounts.openingBalance")}>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </FieldRow>
        ) : null}
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

