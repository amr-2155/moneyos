import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AccountView, type CategoryView, type TransactionView } from "../lib/api";
import { formatDate } from "../lib/format";
import { transactionCategoryOptions } from "../lib/transactions";
import { useI18n } from "../i18n";
import { Button, ConfirmDialog, EmptyState, Field, FieldRow, IconButton, Input, Modal, PageHeader, SegmentedControl, Select, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { TransactionItem } from "../components/TransactionItem";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { localizeCategoryName } from "../lib/categoryNames";

const PAGE_SIZE = 30;

type TxFormType = "income" | "expense" | "transfer";

export function TransactionsPage() {
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [data, setData] = useState<TransactionView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<TransactionView | null>(null);

  const load = useCallback(() => {
    api.transactions
      .list({ page, limit: PAGE_SIZE, sort: "-date" })
      .then((res) => {
        setData(res.data);
        setTotal(res.meta.total);
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }, [page, getError, show]);

  useEffect(() => load(), [load]);

  const grouped = useMemo(() => {
    if (!data) {
      return [];
    }
    const byDate = new Map<string, TransactionView[]>();
    for (const tx of data) {
      const key = tx.date.slice(0, 10);
      const arr = byDate.get(key) ?? [];
      arr.push(tx);
      byDate.set(key, arr);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  const filteredGrouped = useMemo(() => {
    if (!filter.trim()) {
      return grouped;
    }
    const q = filter.trim().toLowerCase();
    return grouped
      .map(([date, txs]) => [date, txs.filter((tx) => !tx.reversalOfId && (tx.description ?? "").toLowerCase().includes(q))] as const)
      .filter(([, txs]) => txs.length > 0);
  }, [grouped, filter]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onReverse() {
    if (!reverseTarget) {
      return;
    }
    api.transactions
      .reverse(reverseTarget.id)
      .then(() => {
        show("success", t("transactions.deleted"));
        setReverseTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  return (
    <div className="page">
      <PageHeader
        title={t("nav.transactions")}
        subtitle={total > 0 ? t("common.count", { count: String(total) }) : undefined}
        controls={
          <div className="controls">
            <Input
              type="search"
              placeholder={t("transactions.searchPlaceholder")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label={t("transactions.searchPlaceholder")}
            />
          </div>
        }
        actions={
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addTransaction")}
          </Button>
        }
      />

      {data === null ? (
        <SkeletonCard rows={8} />
      ) : filteredGrouped.length === 0 ? (
        <EmptyState
          icon="list"
          title={filter ? t("transactions.noMatches") : t("transactions.empty")}
          subtitle={filter ? t("transactions.noMatchesHint") : t("transactions.emptyHint")}
        >
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("actions.addTransaction")}
          </Button>
        </EmptyState>
      ) : (
        <>
          {filteredGrouped.map(([date, txs]) => (
            <section className="card" key={date} aria-label={formatDate(date)}>
              <div className="card-header">
                <h2>{formatDate(date)}</h2>
              </div>
              <ul className="list">
                {txs.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    subtitle={tx.reversedAt ? t("transactions.deletedBadge") : undefined}
                    actions={
                      !tx.reversedAt && !tx.transferId ? (
                        <>
                          <Link to="/add" state={{ tx }} className="icon-btn row-action" aria-label={t("common.edit")}>
                            <Icon name="edit" />
                          </Link>
                          <IconButton
                            icon="x"
                            label={t("transactions.deleteTitle")}
                            className="row-action"
                            onClick={() => setReverseTarget(tx)}
                          />
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
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
        </>
      )}

      <button type="button" className="fab" aria-label={t("actions.addTransaction")} onClick={() => setFormOpen(true)}>
        <Icon name="plus" />
      </button>

      {formOpen ? (
        <TransactionFormModal
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
          title={t("transactions.deleteTitle")}
          message={t("transactions.deleteConfirm")}
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

function TransactionFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [type, setType] = useState<TxFormType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.accounts.list(), api.categories.list()])
      .then(([accs, cats]) => {
        if (cancelled) {
          return;
        }
        setAccounts(accs);
        setCategories(cats);
        const active = accs.filter((a) => a.isActive);
        if (active.length > 0) {
          setAccountId((current) => current || active[0].id);
          setFromAccountId((current) => current || active[0].id);
          setToAccountId((current) => current || (active[1]?.id ?? active[0].id));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const categoryOptions = type === "transfer" ? [] : transactionCategoryOptions(categories, type);
  const activeAccounts = accounts.filter((a) => a.isActive);
  const selectedAccount = accounts.find((a) => a.id === (type === "transfer" ? fromAccountId : accountId));
  const currencyCode = selectedAccount?.currency ?? accounts[0]?.currency ?? "USD";

  const amountValid = amount.trim() !== "" && Number(amount) > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountValid) {
      setError(t("transactions.amountRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (type === "transfer") {
        if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
          setError(t("transactions.transferAccounts"));
          return;
        }
        await api.transfers.create({ fromAccountId, toAccountId, amount, date, notes: notes || undefined });
        show("success", t("transfers.created"));
      } else {
        if (!accountId || !categoryId) {
          setError(t("transactions.requiredFields"));
          return;
        }
        await api.transactions.create({
          type,
          amount,
          accountId,
          categoryId,
          date,
          description: description || undefined,
          notes: notes || undefined,
        });
        show("success", t("transactions.created"));
      }
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("transactions.add")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Field label={t("common.type")}>
          <SegmentedControl
            label={t("common.type")}
            value={type}
            onChange={(value) => {
              setType(value as TxFormType);
              setCategoryId("");
            }}
            options={[
              { value: "income", label: t("types.income") },
              { value: "expense", label: t("types.expense") },
              { value: "transfer", label: t("types.transfer") },
            ]}
          />
        </Field>

        <Field label={t("common.amount")} hint={currencyCode}>
          <Input
            type="number"
            className="input-amount"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
        </Field>

        <Field label={t("common.date")}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        {type === "transfer" ? (
          <FieldRow>
            <Field label={t("transfers.from")}>
              <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("transfers.to")}>
              <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
        ) : (
          <>
            <FieldRow>
              <Field label={t("common.account")}>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("common.category")}>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  <option value="">{t("common.select")}</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {localizeCategoryName(category.name, locale)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <Field label={t("common.description")}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("transactions.descriptionPlaceholder")} />
            </Field>
          </>
        )}

        <Field label={t("common.notes")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("transactions.notesPlaceholder")} />
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
