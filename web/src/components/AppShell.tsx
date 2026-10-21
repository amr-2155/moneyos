import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useI18n, type TranslationKey } from "../i18n";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CommandPalette } from "./CommandPalette";
import { Icon, type IconName } from "./Icon";
import { useToast } from "./Toast";

interface NavItem {
  to: string;
  label: TranslationKey;
  icon: IconName;
  end?: boolean;
  add?: boolean;
  /** Kept out of the phone bar, which stays at five destinations. */
  desktopOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "nav.home", icon: "home", end: true },
  { to: "/add", label: "nav.add", icon: "plus", add: true },
  { to: "/reports", label: "nav.reports", icon: "trendup" },
  { to: "/goals", label: "nav.goals", icon: "star" },
  { to: "/recurring", label: "nav.recurring", icon: "refresh", desktopOnly: true },
  { to: "/more", label: "nav.more", icon: "more" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { offline } = useAuth();
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { show } = useToast();

  // Book anything that fell due since the app was last open. Opening the app is
  // the only reliable trigger on a host with no background jobs, and the
  // operation is idempotent, so running it on every launch is safe.
  useEffect(() => {
    let cancelled = false;
    void api.recurring
      .materialiseAll()
      .then((count) => {
        if (!cancelled && count > 0) {
          show("success", t("recurring.added", { count }));
        }
      })
      .catch(() => {
        // Recurring rules must never block the app from loading.
      });
    return () => {
      cancelled = true;
    };
    // Intentionally once per mount: `show` and `t` are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <aside className="sidebar">
        <Link to="/" className="brand" onClick={(e) => e.currentTarget.blur()}>
          <span className="brand-mark">
            <Icon name="star" size={15} />
          </span>
          MoneyOS
        </Link>
        <nav className="side-nav" aria-label={t("nav.home")}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-item${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="side-footer">
          <NavLink to="/settings" className={({ isActive }) => `side-item${isActive ? " active" : ""}`}>
            <Icon name="settings" />
            {t("nav.settings")}
          </NavLink>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Icon name="star" size={15} />
          </span>
          MoneyOS
        </Link>
        {offline ? (
          <span className="sync-pill" title={t("auth.offlineNotice")}>
            <Icon name="info" size={14} />
            {t("nav.offline")}
          </span>
        ) : null}
        <button
          type="button"
          className="topbar-search"
          onClick={() => setPaletteOpen(true)}
          aria-label={t("command.open")}
          title={`${t("command.open")} · ${t("command.shortcut")}`}
        >
          <Icon name="search" size={16} />
          <span className="topbar-search-label">{t("command.hint")}</span>
          <kbd className="topbar-search-kbd">{t("command.shortcut")}</kbd>
        </button>
      </header>

      <main className="app-main">
        <div className="page-enter" key={pathname}>
          {children}
        </div>
      </main>

      <nav className="bottomnav" aria-label={t("nav.home")}>
        {NAV.filter((item) => !item.desktopOnly).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-label={item.add ? t("nav.add") : undefined}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}${item.add ? " nav-add" : ""}`}
          >
            <span className="nav-icon">
              <Icon name={item.icon} />
            </span>
            <span className="nav-label">{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
