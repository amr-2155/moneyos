import { useRef, useState } from "react";
import { CURRENCIES } from "../lib/format";
import { useAuth, exportAllData, importAllData, exportCSV, deleteAllData } from "../lib/auth";
import { useI18n } from "../i18n";
import { Button, Field, Input, PageHeader, Select } from "../components/ui";
import { LanguageSelector, ThemeSelector } from "../components/ui";
import { useToast } from "../components/Toast";
import { useErrorMessage } from "../lib/errors";
import { loadDistribution, spendingPct } from "../lib/distribution";
import { PlanEditorModal } from "../components/PlanEditor";

const APP_VERSION = "2.0.0";

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const getError = useErrorMessage();
  const { show } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [defaultCurrency, setDefaultCurrency] = useState(user?.defaultCurrency ?? "EGP");
  const [saving, setSaving] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const distribution = loadDistribution();

  async function onSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateUser({ name: name.trim() || undefined, defaultCurrency });
      show("success", t("settings.saved"));
    } catch (err) {
      show("error", getError(err, "errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  async function onExport() {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moneyos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      show("success", t("backup.exportSuccess"));
    } catch (err) {
      show("error", getError(err, "errors.generic"));
    }
  }

  async function onImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object") {
        show("error", t("backup.importInvalid"));
        return;
      }
      await importAllData(data);
      show("success", t("backup.importSuccess"));
      window.location.reload();
    } catch {
      show("error", t("backup.importInvalid"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onExportCSV() {
    try {
      const csv = await exportCSV();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moneyos-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      show("success", t("backup.exportSuccess"));
    } catch (err) {
      show("error", getError(err, "errors.generic"));
    }
  }

  async function onDeleteAll() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await deleteAllData();
      show("success", t("backup.deleteSuccess"));
      window.location.reload();
    } catch (err) {
      show("error", getError(err, "errors.generic"));
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />

      <section className="list-group" aria-label={t("settings.account")}>
        <h2 className="list-group-title">{t("settings.account")}</h2>
        <div className="list-group-card">
          <form onSubmit={(e) => void onSaveProfile(e)}>
            <Field label={t("settings.name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label={t("settings.defaultCurrency")} hint={t("settings.currencyHint")}>
              <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Button type="submit" variant="primary" loading={saving}>
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="list-group" aria-label={t("settings.appearance")}>
        <h2 className="list-group-title">{t("settings.appearance")}</h2>
        <div className="list-group-card">
          <div className="list-row">
            <span className="list-row-icon" aria-hidden>🎨</span>
            <span className="list-row-main">
              <strong>{t("settings.theme")}</strong>
              <span className="list-row-sub">{t("settings.appearanceHint")}</span>
            </span>
            <ThemeSelector variant="grid" />
          </div>
          <div className="list-row">
            <span className="list-row-icon" aria-hidden>🌐</span>
            <span className="list-row-main">
              <strong>{t("settings.language")}</strong>
              <span className="list-row-sub">{t("settings.languageHint")}</span>
            </span>
            <LanguageSelector variant="grid" />
          </div>
        </div>
      </section>

      <section className="list-group" aria-label={t("distribution.title")}>
        <h2 className="list-group-title">{t("distribution.title")}</h2>
        <div className="list-group-card">
          <button type="button" className="list-row" onClick={() => setPlanOpen(true)}>
            <span className="list-row-icon">
              <span className="dot savings" aria-hidden />
            </span>
            <span className="list-row-main">
              <strong>{t("distribution.hint")}</strong>
              <span className="list-row-sub">
                {t("distribution.spending")} {spendingPct(distribution)}% · {t("distribution.savings")} {distribution.savingsPct}% ·{" "}
                {t("distribution.investing")} {distribution.investPct}%
              </span>
            </span>
            <IconChevron />
          </button>
        </div>
      </section>

      <section className="list-group" aria-label={t("backup.title")}>
        <h2 className="list-group-title">{t("backup.title")}</h2>
        <div className="list-group-card">
          <button type="button" className="list-row" onClick={() => void onExport()}>
            <span className="list-row-icon" aria-hidden>📦</span>
            <span className="list-row-main">
              <strong>{t("backup.exportData")}</strong>
              <span className="list-row-sub">{t("backup.exportDataHint")}</span>
            </span>
          </button>
          <button type="button" className="list-row" onClick={() => fileInputRef.current?.click()}>
            <span className="list-row-icon" aria-hidden>📥</span>
            <span className="list-row-main">
              <strong>{t("backup.importData")}</strong>
              <span className="list-row-sub">{t("backup.importDataHint")}</span>
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="sr-only" onChange={(e) => void onImport(e)} />
          <button type="button" className="list-row" onClick={() => void onExportCSV()}>
            <span className="list-row-icon" aria-hidden>📊</span>
            <span className="list-row-main">
              <strong>{t("backup.exportCSV")}</strong>
              <span className="list-row-sub">{t("backup.exportCSVHint")}</span>
            </span>
          </button>
          <button type="button" className="list-row danger" onClick={() => void onDeleteAll()}>
            <span className="list-row-icon" aria-hidden>🗑️</span>
            <span className="list-row-main">
              <strong>{t("backup.deleteAll")}</strong>
              <span className="list-row-sub">
                {deleteConfirm ? t("backup.deleteConfirm") : t("backup.deleteAllHint")}
              </span>
            </span>
          </button>
        </div>
      </section>

      <section className="list-group" aria-label={t("settings.about")}>
        <h2 className="list-group-title">{t("settings.about")}</h2>
        <div className="list-group-card">
          <div className="list-row">
            <span className="list-row-main">
              <strong>{t("app.name")}</strong>
              <span className="list-row-sub">
                {t("settings.version")} {APP_VERSION}
              </span>
            </span>
          </div>
        </div>
      </section>

      <PlanEditorModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSaved={() => setPlanOpen(false)}
      />
    </div>
  );
}

function IconChevron() {
  return <span className="list-row-chevron" aria-hidden>‹</span>;
}
