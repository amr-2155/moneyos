import { useCallback, useEffect, useState } from "react";
import { api, type CategoryRuleView, type CategoryView } from "../lib/api";
import { useI18n } from "../i18n";
import { Badge, Button, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, SkeletonCard } from "../components/ui";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { localizeCategoryName } from "../lib/categoryNames";

export function CategoriesPage() {
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [categories, setCategories] = useState<CategoryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryView | null>(null);
  const [usage, setUsage] = useState<{ transactions: number; budgets: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [rules, setRules] = useState<CategoryRuleView[] | null>(null);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState("");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.categories
      .list()
      .then(setCategories)
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [getError]);

  useEffect(() => load(), [load]);

  const loadRules = useCallback(() => {
    void api.categoryRules
      .list()
      .then(setRules)
      .catch(() => setRules([]));
  }, []);

  useEffect(() => loadRules(), [loadRules]);

  async function onAddRule(event: React.FormEvent) {
    event.preventDefault();
    const pattern = rulePattern.trim();
    if (pattern.length < 3) {
      setRuleError(t("categories.rules.tooShort"));
      return;
    }
    if (!ruleCategoryId) {
      setRuleError(t("categories.rules.chooseCategory"));
      return;
    }

    setSavingRule(true);
    try {
      await api.categoryRules.create({ pattern, categoryId: ruleCategoryId, type: "any" });
      setRulePattern("");
      setRuleCategoryId("");
      setRuleError(null);
      show("success", t("categories.rules.added"));
      loadRules();
    } catch (err) {
      setRuleError(getError(err, "errors.generic"));
    } finally {
      setSavingRule(false);
    }
  }

  function onRemoveRule(rule: CategoryRuleView) {
    api.categoryRules
      .remove(rule.id)
      .then((removed) => {
        show("success", t("categories.rules.removed"), {
          action: {
            label: t("common.undo"),
            onAction: () => {
              api.categoryRules
                .restore(removed)
                .then(() => {
                  show("success", t("common.restore"));
                  loadRules();
                })
                .catch((err) => show("error", getError(err, "errors.generic")));
            },
          },
        });
        loadRules();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  function onToggleRule(rule: CategoryRuleView) {
    api.categoryRules
      .setActive(rule.id, !rule.isActive)
      .then(loadRules)
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  /**
   * Archiving is reversible, so it runs immediately and the toast offers an
   * undo instead of interrupting the user with a confirm dialog.
   */
  function onArchive(category: CategoryView) {
    api.categories
      .archive(category.id)
      .then(() => {
        show("success", t("categories.archived"), {
          action: {
            label: t("common.undo"),
            onAction: () => {
              api.categories
                .restore(category.id)
                .then(() => {
                  show("success", t("categories.restored"));
                  load();
                })
                .catch((err) => show("error", getError(err, "errors.generic")));
            },
          },
        });
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  /**
   * Loads how much still references the category so the confirm dialog can say
   * whether deleting is allowed, instead of failing after the user confirms.
   */
  function openDelete(category: CategoryView) {
    setDeleteTarget(category);
    setUsage(null);
    api.categories
      .usage(category.id)
      .then(setUsage)
      .catch(() => setUsage({ transactions: 0, budgets: 0 }));
  }

  function onDeleted() {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    api.categories
      .remove(deleteTarget.id)
      .then((removed) => {
        show("success", t("categories.deleted"), {
          action: {
            label: t("common.undo"),
            onAction: () => {
              api.categories
                .restoreDeleted(removed)
                .then(() => {
                  show("success", t("common.restore"));
                  load();
                })
                .catch((err) => show("error", getError(err, "errors.generic")));
            },
          },
        });
        setDeleteTarget(null);
        setUsage(null);
        setDeleting(false);
        load();
      })
      .catch((err) => {
        setDeleting(false);
        show("error", getError(err, "categories.deleteBlocked"));
      });
  }

  function onRestored(category: CategoryView) {
    api.categories
      .restore(category.id)
      .then(() => {
        show("success", t("categories.restored"));
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  const income = (categories ?? []).filter((category) => !category.isArchived && category.type !== "expense");
  const expenses = (categories ?? []).filter((category) => !category.isArchived && category.type !== "income");
  const archived = (categories ?? []).filter((category) => category.isArchived);

  const renderCategory = (category: CategoryView, archived = false) => (
    <li className={`category-row${archived ? " is-archived" : ""}`} key={category.id}>
      <span
        className="category-dot"
        style={category.color ? { backgroundColor: category.color } : undefined}
        aria-hidden
      />
      <div className="category-main">
        <div className="category-name">{localizeCategoryName(category.name, locale)}</div>
      </div>
      {category.system ? <Badge tone="neutral">{t("categories.system")}</Badge> : null}
      <div className="category-actions">
        <Button
          variant="ghost"
          size="sm"
          icon="edit"
          aria-label={t("common.edit")}
          onClick={() => {
            setEditing(category);
            setFormOpen(true);
          }}
        >
          {t("common.edit")}
        </Button>
        {archived ? (
          <Button variant="ghost" size="sm" icon="undo" onClick={() => onRestored(category)}>
            {t("common.restore")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onArchive(category)}>
            {t("common.archive")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          className="category-delete"
          aria-label={t("common.delete")}
          onClick={() => openDelete(category)}
        >
          {t("common.delete")}
        </Button>
      </div>
    </li>
  );

  return (
    <div className="page">
      <PageHeader
        title={t("nav.categories")}
        subtitle={categories ? t("common.count", { count: String(categories.length) }) : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
            {t("categories.add")}
          </Button>
        }
      />

      {error ? (
        <EmptyState icon="alert" title={t("errors.generic")} subtitle={error}>
          <Button onClick={() => load()}>{t("actions.retry")}</Button>
        </EmptyState>
      ) : categories === null ? (
        <SkeletonCard rows={6} />
      ) : (
        <div className="page-stack">
          <section className="card">
            <div className="card-header">
              <h2>{t("types.income")}</h2>
            </div>
            {income.length === 0 ? (
              <EmptyState icon="trendup" title={t("categories.empty")} subtitle={t("categories.emptyHint")} compact />
            ) : (
              <ul className="list">{income.map((category) => renderCategory(category))}</ul>
            )}
          </section>
          <section className="card">
            <div className="card-header">
              <h2>{t("types.expense")}</h2>
            </div>
            {expenses.length === 0 ? (
              <EmptyState icon="trenddown" title={t("categories.empty")} subtitle={t("categories.emptyHint")} compact />
            ) : (
              <ul className="list">{expenses.map((category) => renderCategory(category))}</ul>
            )}
          </section>

          {archived.length > 0 ? (
            <section className="card">
              <div className="card-header">
                <h2>{t("categories.archivedTitle")}</h2>
                <button type="button" className="link" onClick={() => setShowArchived((open) => !open)}>
                  {showArchived ? t("categories.hideArchived") : t("categories.showArchived")}
                </button>
              </div>
              {showArchived ? (
                <ul className="list">{archived.map((category) => renderCategory(category, true))}</ul>
              ) : (
                <p className="sub">{t("common.count", { count: String(archived.length) })}</p>
              )}
            </section>
          ) : null}

          <section className="card rules-card">
            <div className="card-header">
              <h2>{t("categories.rules.title")}</h2>
            </div>
            <p className="sub">{t("categories.rules.hint")}</p>

            <form className="rule-form" onSubmit={(event) => void onAddRule(event)}>
              <Input
                value={rulePattern}
                onChange={(event) => {
                  setRulePattern(event.target.value);
                  setRuleError(null);
                }}
                placeholder={t("categories.rules.patternPlaceholder")}
                aria-label={t("categories.rules.pattern")}
              />
              <Select
                value={ruleCategoryId}
                aria-label={t("categories.rules.category")}
                onChange={(event) => {
                  setRuleCategoryId(event.target.value);
                  setRuleError(null);
                }}
              >
                <option value="">{t("categories.rules.chooseCategory")}</option>
                {(categories ?? [])
                  .filter((category) => !category.isArchived)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {localizeCategoryName(category.name, locale)}
                    </option>
                  ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary" disabled={savingRule}>
                {t("categories.rules.add")}
              </Button>
            </form>
            {ruleError ? <p className="error-note">{ruleError}</p> : null}

            {rules === null ? null : rules.length === 0 ? (
              <p className="sub rules-empty">{t("categories.rules.empty")}</p>
            ) : (
              <ul className="list rule-list">
                {rules.map((rule) => (
                  <li className={`rule-row${rule.isActive ? "" : " is-off"}`} key={rule.id}>
                    <span className="rule-pattern">{rule.pattern}</span>
                    <Icon name="chevron-right" size={14} className="rule-arrow" />
                    <span className="rule-category">{localizeCategoryName(rule.categoryName, locale)}</span>
                    <span className="rule-hits">{t("categories.rules.uses", { count: String(rule.hits) })}</span>
                    <IconButton
                      icon="eye"
                      label={rule.isActive ? t("categories.rules.pause") : t("categories.rules.resume")}
                      className="rule-action"
                      aria-pressed={!rule.isActive}
                      onClick={() => onToggleRule(rule)}
                    />
                    <IconButton
                      icon="trash"
                      label={t("common.delete")}
                      className="rule-action"
                      onClick={() => onRemoveRule(rule)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {formOpen ? (
        <CategoryFormModal
          editing={editing}
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

      {deleteTarget ? (
        <ConfirmDialog
          title={t("categories.deleteTitle")}
          message={
            usage === null
              ? t("categories.deleteConfirm", { name: localizeCategoryName(deleteTarget.name, locale) })
              : usage.transactions > 0 || usage.budgets > 0
                ? t("categories.deleteBlocked", {
                    name: localizeCategoryName(deleteTarget.name, locale),
                    count: String(usage.transactions + usage.budgets),
                  })
                : t("categories.deleteConfirm", { name: localizeCategoryName(deleteTarget.name, locale) })
          }
          confirmLabel={t("common.delete")}
          cancelLabel={t("actions.cancel")}
          tone="danger"
          loading={deleting}
          onConfirm={() => void onDeleted()}
          onCancel={() => {
            setDeleteTarget(null);
            setUsage(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: CategoryView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [name, setName] = useState(editing ? localizeCategoryName(editing.name, locale) : "");
  const [type, setType] = useState<"income" | "expense">(editing && editing.type === "income" ? "income" : "expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("categories.nameRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await api.categories.update(editing.id, { name: name.trim() });
        show("success", t("categories.updated"));
      } else {
        await api.categories.create({ name: name.trim(), type });
        show("success", t("categories.created"));
      }
      onSaved();
    } catch (err) {
      setError(getError(err, "errors.generic"));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? t("common.edit") : t("categories.add")} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Field label={t("categories.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        {!editing ? (
          <Field label={t("common.type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as "income" | "expense")}>
              <option value="expense">{t("types.expense")}</option>
              <option value="income">{t("types.income")}</option>
            </Select>
          </Field>
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
