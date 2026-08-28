import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import { I18nProvider } from "../i18n";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider } from "../lib/theme";

/** Renders a page inside the full provider stack with an empty router. */
export function renderPage(ui: React.ReactElement, options?: { route?: string }) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={[options?.route ?? "/"]}>
          <AuthProvider>
            <ToastProvider>{ui}</ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>,
  );
}
