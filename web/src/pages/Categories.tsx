import { useCallback, useEffect, useState } from "react";
import { api, type CategoryView } from "../lib/api";
import { useI18n } from "../i18n";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, SkeletonCard } from "../components/ui";
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
  const [archiveTarget, setArchiveTarget] = useState<CategoryView | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.categories
      .list()
      .then(setCategories)
      .catch((err) => setError(getError(err, "errors.generic")));
  }, [getError]);

  useEffect(() => load(), [load]);

  function onArchived() {
    if (!archiveTarget) {
      return;
    }
    api.categories
      .archive(archiveTarget.id)
      .then(() => {
        show("success", t("categories.archived"));
        setArchiveTarget(null);
        load();
      })
      .catch((err) => show("error", getError(err, "errors.generic")));
  }

  const income = (categories ?? []).filter((category) => !category.isArchived && category.type !== "expense");
  const expenses = (categories ?? []).filter((category) => !category.isArchived && category.type !== "income");

  const renderCategory = (category: CategoryView) => (
    <li className="category-row" key={category.id}>
      <span
        className="category-dot"
        style={category.color ? { backgroundColor: category.color } : undefined}
        aria-hidden
      />
      <div className="category-main">
        <div className="category-name">{localizeCategoryName(category.name, locale)}</div>
      </div>
      {category.system ? <Badge tone="neutral">{t("categories.system")}</Badge> : null}
      {!category.system ? (
        <div className="category-actions">
          <Button
            variant="ghost"
            size="sm"
            icon="edit"
            onClick={() => {
              setEditing(category);
              setFormOpen(true);
            }}
          >
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(category)}>
            {t("common.archive")}
          </Button>
        </div>
      ) : null}
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
              <ul className="list">{income.map(renderCategory)}</ul>
            )}
          </section>
          <section className="card">
            <div className="card-header">
              <h2>{t("types.expense")}</h2>
            </div>
            {expenses.length === 0 ? (
              <EmptyState icon="trenddown" title={t("categories.empty")} subtitle={t("categories.emptyHint")} compact />
            ) : (
              <ul className="list">{expenses.map(renderCategory)}</ul>
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

      {archiveTarget ? (
        <ConfirmDialog
          title={t("categories.archiveTitle")}
          message={t("categories.archiveConfirm", { name: localizeCategoryName(archiveTarget.name, locale) })}
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
