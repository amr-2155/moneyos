import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type AccountView, type CategoryView, type TransactionView } from "../lib/api";
import { currencyLabel, minorToDecimal } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n";
import { Button, Input, SkeletonBlock } from "../components/ui";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { transactionCategoryOptions } from "../lib/transactions";
import { categoryEmoji, localizeCategoryName } from "../lib/categoryNames";

type TxType = "income" | "expense";

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

const MAX_INT_DIGITS = 12;

const MOST_USED_KEY = "moneyos:recent-cats";

function loadRecentCats(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MOST_USED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentCat(id: string) {
  const list = loadRecentCats().filter((c) => c !== id);
  list.unshift(id);
  localStorage.setItem(MOST_USED_KEY, JSON.stringify(list.slice(0, 6)));
}

function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = `${s.slice(0, dot)}.${s.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
  }
  if (s.startsWith(".")) {
    s = `0${s}`;
  }
  const [int, frac] = s.split(".");
  if (int.length > MAX_INT_DIGITS) {
    s = frac === undefined ? int.slice(0, MAX_INT_DIGITS) : `${int.slice(0, MAX_INT_DIGITS)}.${frac}`;
  }
  return s;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function AddPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const editingTx = (location.state as { tx?: TransactionView } | null)?.tx ?? null;

  const [type, setType] = useState<TxType>(() =>
    editingTx && (editingTx.type === "income" || editingTx.type === "expense")
      ? editingTx.type
      : params.get("type") === "income"
        ? "income"
        : "expense",
  );
  const [amount, setAmount] = useState(editingTx ? minorToDecimal(editingTx.amountMinor, editingTx.currency) : "");
  const [categoryId, setCategoryId] = useState(editingTx?.categoryId ?? "");
  const [note, setNote] = useState(editingTx?.notes ?? editingTx?.description ?? "");
  const [date, setDate] = useState(editingTx?.date ?? new Date().toISOString().slice(0, 10));

  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [categories, setCategories] = useState<CategoryView[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [showNote, setShowNote] = useState(Boolean(editingTx?.notes || editingTx?.description));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.accounts.list(), api.categories.list()])
      .then(([accs, cats]) => {
        if (cancelled) return;
        setAccounts(accs);
        setCategories(cats);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setAccounts([]);
          setCategories([]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = yesterdayISO();

  const categoryOptions = useMemo(
    () => transactionCategoryOptions(categories ?? [], type),
    [categories, type],
  );
  const selectedAccount = (accounts ?? []).find((account) => account.isActive);
  const currencyCode = selectedAccount?.currency ?? editingTx?.currency ?? user?.defaultCurrency ?? "EGP";
  const selectedCategory = (categories ?? []).find((category) => category.id === categoryId) ?? null;
  const numeric = amount === "" ? 0 : Number(amount);
  const amountValid = numeric > 0;

  const recentCatIds = useMemo(() => loadRecentCats(), [categories, pickerOpen]);
  const recentCategories = useMemo(() => {
    return recentCatIds
      .map((id) => categoryOptions.find((c) => c.id === id))
      .filter((c): c is CategoryView => !!c)
      .slice(0, 5);
  }, [recentCatIds, categoryOptions]);

  const suggestions = useMemo(() => {
    const query = note.trim().toLowerCase();
    if (!query || categoryId || categoryOptions.length === 0) return [];
    return categoryOptions
      .filter((category) => query.includes(localizeCategoryName(category.name, locale).toLowerCase()))
      .slice(0, 2);
  }, [note, categoryId, categoryOptions, locale]);

  function groupedAmount(raw: string): string {
    const [int, frac] = raw.split(".");
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567);
    const group = parts.find((part) => part.type === "group")?.value ?? ",";
    const dec = parts.find((part) => part.type === "decimal")?.value ?? ".";
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
    return frac === undefined ? grouped : `${grouped}${dec}${frac}`;
  }

  function switchType(next: TxType) {
    if (editingTx || next === type) return;
    setType(next);
    setCategoryId("");
    setPickerOpen(false);
    setSearch("");
    setAmountError(null);
  }

  function addQuick(value: number) {
    setAmount((prev) => sanitizeAmount(String((prev === "" ? 0 : Number(prev)) + value)));
    setAmountError(null);
  }

  function pickCategory(cat: CategoryView) {
    setCategoryId(cat.id);
    saveRecentCat(cat.id);
    setPickerOpen(false);
    setError(null);
  }

  async function submitCreateCategory() {
    const name = newName.trim();
    if (!name) {
      setCategoryError(t("categories.nameRequired"));
      return;
    }
    if ((categories ?? []).some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setCategoryError(t("add.categoryExists"));
      return;
    }
    setCreating(true);
    setCategoryError(null);
    try {
      const created = await api.categories.create({ name, type });
      setCategories((prev) => (prev ? [...prev, created] : [created]));
      saveRecentCat(created.id);
      setCategoryId(created.id);
      setNewName("");
      setCreateOpen(false);
      setPickerOpen(false);
      setError(null);
      show("success", t("categories.created"));
    } catch (err) {
      setCategoryError(getError(err, "errors.generic"));
    } finally {
      setCreating(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountValid) {
      setAmountError(t("add.amountRequired"));
      return;
    }
    if (!categoryId) {
      setError(t("add.requiredFields"));
      return;
    }
    setError(null);
    setAmountError(null);
    setSaving(true);
    try {
      let accountId = editingTx?.accountId ?? selectedAccount?.id;
      if (!accountId) {
        const created = await api.accounts.create({
          name: t("accounts.quickCash"),
          type: "cash",
          currency: user?.defaultCurrency ?? "EGP",
          openingBalance: "0",
        });
        accountId = created.id;
      }
      const body = {
        type,
        amount,
        accountId,
        categoryId,
        date,
        description: note.trim() || undefined,
        notes: note.trim() || undefined,
      };
      if (editingTx) {
        await api.transactions.reverse(editingTx.id);
      }
      await api.transactions.create(body);
      setSaving(false);
      const amtDisplay = `${groupedAmount(amount)} ${currencyLabel(currencyCode)}`;
      const typeLabel = type === "income" ? t("add.income") : t("add.expense");
      show("success", `${typeLabel} ${amtDisplay}`);
      window.setTimeout(() => navigate("/", { replace: true }), 800);
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  const dateLabel = (() => {
    if (date === today) {
      const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00`));
      return `${t("add.today")} — ${short}`;
    }
    if (date === yesterday) {
      const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00`));
      return `${t("add.yesterday")} — ${short}`;
    }
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
  })();

  return (
    <div className={`page add-page add-page--${type}`}>
      <div className="add-top">
        <h1 className="add-title">{editingTx ? t("add.editTitle") : t("add.pageTitle")}</h1>
        <p className="add-subtitle">{t("add.subtitle")}</p>
        <div className="add-switch" role="tablist" aria-label={t("add.category")}>
          <span className={`add-switch-thumb ${type}`} aria-hidden />
          <button
            type="button"
            role="tab"
            aria-selected={type === "income"}
            className={type === "income" ? "active" : ""}
            disabled={Boolean(editingTx)}
            onClick={() => switchType("income")}
          >
            {t("add.income")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === "expense"}
            className={type === "expense" ? "active" : ""}
            disabled={Boolean(editingTx)}
            onClick={() => switchType("expense")}
          >
            {t("add.expense")}
          </button>
        </div>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="add-form">
        {/* ── Amount hero ── */}
        <div className="add-hero">
          <span className="add-hero-label">{t("add.amount")}</span>
          <div className="add-amount">
            <input
              className={`add-amount-input ${type}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0"
              value={groupedAmount(amount)}
              aria-label={t("add.amount")}
              onChange={(event) => {
                setAmount(sanitizeAmount(event.target.value));
                setAmountError(null);
              }}
            />
            <span className="add-amount-currency">{currencyLabel(currencyCode)}</span>
          </div>
          {amountError ? (
            <div className="error-note" role="alert">{amountError}</div>
          ) : null}
          <div className="add-quick" role="group" aria-label={t("add.quickAmounts")}>
            {QUICK_AMOUNTS.map((value) => (
              <button key={value} type="button" className="add-quick-chip" onClick={() => addQuick(value)}>
                +{new Intl.NumberFormat(locale).format(value)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Category ── */}
        <div className="add-field">
          <span className="add-field-label">{t("add.category")}</span>
          {categories === null ? (
            <SkeletonBlock height={48} />
          ) : (
            <>
              <button
                type="button"
                className="add-cat-btn"
                aria-expanded={pickerOpen}
                onClick={() => {
                  setPickerOpen((open) => !open);
                  setSearch("");
                  setCategoryError(null);
                }}
              >
                <span className="add-cat-btn-emoji" aria-hidden>
                  {selectedCategory ? selectedCategory.icon || categoryEmoji(selectedCategory.name, selectedCategory.type) : "🏷️"}
                </span>
                <span className="add-cat-btn-label">
                  {selectedCategory ? localizeCategoryName(selectedCategory.name, locale) : t("add.chooseCategory")}
                </span>
                <Icon name="chevron-down" size={18} className="add-cat-btn-chevron" />
              </button>

              {/* Most used */}
              {!pickerOpen && recentCategories.length > 0 && !categoryId && (
                <div className="add-recent">
                  <span className="add-recent-label">{t("add.mostUsed")}</span>
                  <div className="add-recent-chips">
                    {recentCategories.map((cat) => (
                      <button key={cat.id} type="button" className="add-recent-chip" onClick={() => pickCategory(cat)}>
                        <span aria-hidden>{cat.icon || categoryEmoji(cat.name, cat.type)}</span>
                        {localizeCategoryName(cat.name, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pickerOpen ? (
                <div className="add-cat-panel">
                  <Input
                    className="add-cat-search"
                    value={search}
                    placeholder={t("add.searchCategories")}
                    aria-label={t("add.searchCategories")}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {categoryOptions.length === 0 ? (
                    <p className="muted add-cat-empty">{t("add.noCategories")}</p>
                  ) : (
                    <div className="add-cat-chips">
                      {categoryOptions
                        .filter((category) =>
                          localizeCategoryName(category.name, locale).toLowerCase().includes(search.trim().toLowerCase()),
                        )
                        .map((category) => {
                          const selected = category.id === categoryId;
                          return (
                            <button
                              key={category.id}
                              type="button"
                              className={`add-cat-chip${selected ? " selected" : ""}`}
                              aria-pressed={selected}
                              onClick={() => pickCategory(category)}
                            >
                              <span aria-hidden>{category.icon || categoryEmoji(category.name, category.type)}</span>
                              {localizeCategoryName(category.name, locale)}
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {createOpen ? (
                    <div className="add-cat-create">
                      <Input
                        value={newName}
                        placeholder={t("add.categoryPlaceholder")}
                        aria-label={t("categories.name")}
                        autoFocus
                        onChange={(event) => { setNewName(event.target.value); setCategoryError(null); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); void submitCreateCategory(); }
                        }}
                      />
                      {categoryError ? <div className="error-note" role="alert">{categoryError}</div> : null}
                      <div className="add-cat-create-actions">
                        <Button variant="ghost" size="sm" onClick={() => { setCreateOpen(false); setCategoryError(null); setNewName(""); }}>
                          {t("common.cancel")}
                        </Button>
                        <Button variant="primary" size="sm" loading={creating} onClick={() => void submitCreateCategory()}>
                          {t("add.addCategory")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="add-cat-new" onClick={() => setCreateOpen(true)}>
                      <Icon name="plus" size={16} /> {t("add.addCategory")}
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* ── Date ── */}
        <div className="add-field add-date-row">
          <span className="add-field-label">{t("add.date")}</span>
          <div className="add-date-quick">
            <button
              type="button"
              className={`add-date-quick-btn${date === today ? " active" : ""}`}
              onClick={() => setDate(today)}
            >
              {t("add.today")}
            </button>
            <button
              type="button"
              className={`add-date-quick-btn${date === yesterday ? " active" : ""}`}
              onClick={() => setDate(yesterday)}
            >
              {t("add.yesterday")}
            </button>
          </div>
          <label className="add-date-btn">
            <span className="add-date-icon">
              <Icon name="clock" size={18} />
            </span>
            <span className="add-date-text">{dateLabel}</span>
            <input
              type="date"
              className="add-date-input"
              value={date}
              aria-label={t("add.date")}
              onChange={(event) => { if (event.target.value) setDate(event.target.value); }}
            />
          </label>
        </div>

        {/* ── Note ── */}
        <div className="add-field add-note">
          {showNote ? (
            <>
              <span className="add-field-label" id="add-note-label">{t("add.note")}</span>
              <Input
                id="add-note-input"
                value={note}
                aria-label={t("add.note")}
                placeholder={t("add.notePlaceholder")}
                onChange={(event) => setNote(event.target.value)}
              />
              {suggestions.length > 0 ? (
                <div className="add-suggest">
                  {suggestions.map((category) => (
                    <button key={category.id} type="button" className="add-suggest-chip" onClick={() => { setCategoryId(category.id); setError(null); }}>
                      <span aria-hidden>{category.icon || categoryEmoji(category.name, category.type)}</span>
                      {t("add.suggest", { name: localizeCategoryName(category.name, locale) })}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <button type="button" className="add-note-toggle" onClick={() => setShowNote(true)}>
              <Icon name="plus" size={16} /> {t("add.addNote")}
            </button>
          )}
        </div>

        {loadError ? <div className="error-note" role="alert">{t("errors.generic")}</div> : null}

        {/* ── Save ── */}
        <div className="add-save-bar">
          {error ? <div className="error-note" role="alert">{error}</div> : null}
          <Button type="submit" variant="primary" size="lg" block icon="check" loading={saving}>
            {t("add.saveTransaction")}
          </Button>
        </div>
      </form>
    </div>
  );
}
