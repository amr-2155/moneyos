import { useCallback, useEffect, useState } from "react";
import { api, type AccountView, type TransferView } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { useI18n } from "../i18n";
import { Badge, Button, ConfirmDialog, EmptyState, Field, FieldRow, IconButton, Input, Modal, PageHeader, Select, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";

const PAGE_SIZE = 30;

export function TransfersPage() {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [data, setData] = useState<TransferView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<TransferView | null>(null);

  const load = useCallback(() => {
    api.transfers
      .list({ page, limit: PAGE_SIZE })
      .then((res) => {
        setData(res.data);
        setTotal(res.meta.total);
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }, [page, getError, show]);

  useEffect(() => load(), [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onReverse() {
    if (!reverseTarget) {
      return;
    }
    api.transfers
      .reverse(reverseTarget.id)
      .then(() => {
        show("success", t("transfers.reversed"));
        setReverseTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  return (
    <div className="page">
      <PageHeader
        title={t("nav.transfers")}
        subtitle={total > 0 ? t("common.count", { count: String(total) }) : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addTransfer")}
          </Button>
        }
      />

      {data === null ? (
        <SkeletonCard rows={6} />
      ) : data.length === 0 ? (
        <EmptyState icon="swap" title={t("transfers.empty")} subtitle={t("transfers.emptyHint")}>
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addTransfer")}
          </Button>
        </EmptyState>
      ) : (
        <section className="card">
          <div className="card-header">
            <h2>{t("nav.transfers")}</h2>
          </div>
          <ul className="list">
            {data.map((transfer) => {
              const from = transfer.legs.find((leg) => leg.accountId === transfer.fromAccountId);
              const to = transfer.legs.find((leg) => leg.accountId === transfer.toAccountId);
              return (
                <li className="list-item" key={transfer.id}>
                  <span className="tx-icon transfer">
                    <Icon name="swap" />
                  </span>
                  <div className="tx-main">
                    <div className="tx-title">
                      {from?.description ?? "→"} → {to?.description ?? ""}
                    </div>
                    <div className="tx-sub">{formatDate(transfer.date.slice(0, 10))}</div>
                  </div>
                  <div className="tx-amount">
                    {formatCurrency(transfer.amountMinor, transfer.currency)}
                  </div>
                  {!transfer.reversedAt ? (
                    <IconButton
                      icon="refresh"
                      label={t("transfers.reverseTitle")}
                      className="row-action"
                      onClick={() => setReverseTarget(transfer)}
                    />
                  ) : (
                    <Badge tone="neutral">{t("transfers.reversed")}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 ? (
            <div className="pagination">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t("actions.previous")}
              </Button>
              <span className="pagination-label">
                {page} / {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
                {t("actions.next")}
              </Button>
            </div>
          ) : null}
        </section>
      )}

      {formOpen ? (
        <TransferFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setPage(1);
            load();
          }}
        />
      ) : null}

      {reverseTarget ? (
        <ConfirmDialog
          title={t("transfers.reverseTitle")}
          message={t("transfers.reverseConfirm")}
          confirmLabel={t("actions.confirm")}
          cancelLabel={t("actions.cancel")}
          tone="danger"
          onConfirm={() => void onReverse()}
          onCancel={() => setReverseTarget(null)}
        />
      ) : null}
    </div>
  );
}

function TransferFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.accounts
      .list()
      .then((accounts) => {
        if (cancelled) {
          return;
        }
        setAccounts(accounts);
        const active = accounts.filter((a) => a.isActive);
        if (active.length > 0) {
          setFromAccountId((current) => current || active[0].id);
          setToAccountId((current) => current || (active[1]?.id ?? active[0].id));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const toOptions = activeAccounts.filter((a) => a.id !== fromAccountId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      setError(t("transactions.transferAccounts"));
      return;
    }
    if (!numeric || numeric <= 0) {
      setError(t("transactions.amountRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.transfers.create({
        fromAccountId,
        toAccountId,
        amount,
        date,
        notes: notes.trim() || undefined,
      });
      show("success", t("transfers.created"));
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("actions.addTransfer")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <FieldRow>
          <Field label={t("transfers.from")}>
            <Select
              value={fromAccountId}
              onChange={(e) => {
                setFromAccountId(e.target.value);
                if (e.target.value === toAccountId) {
                  setToAccountId("");
                }
              }}
              required
            >
              <option value="">{t("common.select")}</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("transfers.to")}>
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
              <option value="">{t("common.select")}</option>
              {toOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <Field label={t("common.amount")}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
        </Field>
        <Field label={t("common.date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={t("common.notes")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
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
