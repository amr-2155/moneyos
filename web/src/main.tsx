import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./components/Toast";
import { I18nProvider } from "./i18n";
import "./styles.css";

/**
 * MoneyOS is served from three very different hosts, so the router adapts:
 *
 *  - Fastify server / Android APK — mounted at `/app`, with server-side SPA
 *    fallback, so clean URLs (`/app/budgets`) survive a refresh.
 *  - Static hosts (GitHub Pages) — the app is a real file (`app.html`) and
 *    there is no rewrite rule, so hash routing keeps deep links and refreshes
 *    working without any server configuration.
 */
function AppRouter({ children }: { children: React.ReactNode }) {
  const { pathname } = window.location;

  if (/\.html?$/i.test(pathname)) {
    return <HashRouter>{children}</HashRouter>;
  }

  const base = import.meta.env.BASE_URL || "/";
  const trimmedBase = base.replace(/\/+$/, "");
  const basename =
    pathname === "/app" || pathname.startsWith("/app/") ? `${trimmedBase}/app` : trimmedBase || "/";

  return <BrowserRouter basename={basename}>{children}</BrowserRouter>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <AppRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </AppRouter>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
