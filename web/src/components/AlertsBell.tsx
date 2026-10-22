import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { alertHref, computeAlerts, type AppAlert } from "../lib/alerts";
import { Icon, type IconName } from "./Icon";

const DISMISS_KEY = "moneyos.alerts.dismissed";
const MAX_DISMISSED = 200;

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>): void {
  try {
    const trimmed = Array.from(ids).slice(-MAX_DISMISSED);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage can be full or blocked; dismissing is still honoured in-memory.
  }
}

const ALERT_ICON: Record<AppAlert["kind"], IconName> = {
  "bill-overdue": "alert",
  "bill-due": "clock",
  "bill-soon": "clock",
  "budget-over": "trenddown",
  "budget-warning": "trenddown",
  "goal-reached": "star",
};

/**
 * The in-app inbox for everything that needs attention: due bills, budgets
 * running out, goals that got there.
 *
 * Deliberately local-only. Real push needs a server to stay awake; this works
 * offline and costs nothing, and the same `computeAlerts` is what a scheduled
 * Android notification would use.
 */
export function AlertsBell() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<string>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const root = useRef<HTMLDivElement>(null);
  const notified = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => {
    void computeAlerts()
      .then(setAlerts)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  // Coming back to the tab is the natural moment to re-check bills.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = useMemo(() => alerts.filter((alert) => !dismissed.has(alert.id)), [alerts, dismissed]);

  function describe(alert: AppAlert): string {
    switch (alert.kind) {
      case "bill-overdue":
        return t("alerts.billOverdue", { name: alert.ruleName, count: String(alert.daysLate) });
      case "bill-due":
        return t("alerts.billDue", { name: alert.ruleName });
      case "bill-soon":
        return t("alerts.billSoon", { name: alert.ruleName });
      case "budget-over":
        return t("alerts.budgetOver", { name: alert.categoryName, percent: String(alert.percent) });
      case "budget-warning":
        return t("alerts.budgetWarning", { name: alert.categoryName, percent: String(alert.percent) });
      case "goal-reached":
        return t("alerts.goalReached", { name: alert.goalName });
    }
  }

  function dismiss(id: string) {
    setDismissed((current) => {
      const next = new Set(current).add(id);
      persistDismissed(next);
      return next;
    });
  }

  function clearAll() {
    setDismissed((current) => {
      const next = new Set(current);
      for (const alert of active) next.add(alert.id);
      persistDismissed(next);
      return next;
    });
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  // Only speak up in the background; if the tab is visible the bell is enough.
  useEffect(() => {
    if (permission !== "granted" || typeof Notification === "undefined") return;
    if (document.visibilityState !== "hidden") return;

    const fresh = active.filter((alert) => !notified.current.has(alert.id)).slice(0, 3);
    for (const alert of fresh) {
      notified.current.add(alert.id);
      try {
        new Notification(t("alerts.notificationTitle"), { body: describe(alert), icon: "/favicon-192.png" });
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    }
    // describe() depends on the current language; t changes identity on switch.
  }, [active, permission, t]);

  return (
    <div className="alerts" ref={root}>
      <button
        type="button"
        className="icon-btn topbar-bell"
        aria-label={t("alerts.title")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" />
        {active.length > 0 ? <span className="alerts-badge">{active.length}</span> : null}
      </button>

      {open ? (
        <div className="alerts-panel" role="dialog" aria-label={t("alerts.title")}>
          <div className="alerts-head">
            <strong>{t("alerts.title")}</strong>
            {active.length > 0 ? (
              <button type="button" className="link" onClick={clearAll}>
                {t("alerts.clearAll")}
              </button>
            ) : null}
          </div>

          {active.length === 0 ? (
            <p className="alerts-empty">{t("alerts.empty")}</p>
          ) : (
            <ul className="alerts-list">
              {active.map((alert) => (
                <li key={alert.id} className={`alert-row ${alert.severity}`}>
                  <Link to={alertHref(alert)} className="alert-main" onClick={() => setOpen(false)}>
                    <Icon name={ALERT_ICON[alert.kind]} />
                    <span>{describe(alert)}</span>
                  </Link>
                  <button
                    type="button"
                    className="icon-btn alert-dismiss"
                    aria-label={t("alerts.dismiss")}
                    onClick={() => dismiss(alert.id)}
                  >
                    <Icon name="x" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {permission === "default" ? (
            <button type="button" className="alerts-enable" onClick={() => void enableNotifications()}>
              <Icon name="bell" size={14} />
              {t("alerts.enable")}
            </button>
          ) : null}
          {permission === "denied" ? <p className="alerts-note">{t("alerts.blocked")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}