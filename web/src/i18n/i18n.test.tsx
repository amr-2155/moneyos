import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider, useI18n } from "./index";

function Probe() {
  const { locale, dir, t, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="signin">{t("auth.signIn")}</span>
      <span data-testid="count">{t("common.count", { count: "3" })}</span>
      <button onClick={() => setLocale("ar")}>ar</button>
      <button onClick={() => setLocale("en")}>en</button>
    </div>
  );
}

function setNavigatorLanguage(value: string) {
  Object.defineProperty(window.navigator, "language", { value, configurable: true });
}

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  it("defaults to English (ltr) for a non-Arabic browser", () => {
    setNavigatorLanguage("en-US");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    expect(localStorage.getItem("moneyos.locale")).toBe("en");
  });

  it("defaults to Arabic (rtl) for an Arabic browser", () => {
    setNavigatorLanguage("ar-EG");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("ar");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
  });

  it("switches to Arabic, flips the document direction and persists", async () => {
    setNavigatorLanguage("en-US");
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    await user.click(screen.getByText("ar"));
    expect(screen.getByTestId("locale")).toHaveTextContent("ar");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(localStorage.getItem("moneyos.locale")).toBe("ar");
    expect(screen.getByTestId("signin")).toHaveTextContent("تسجيل الدخول");
  });

  it("switches back to English", async () => {
    setNavigatorLanguage("en-US");
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    await user.click(screen.getByText("ar"));
    await user.click(screen.getByText("en"));
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
    expect(localStorage.getItem("moneyos.locale")).toBe("en");
  });

  it("interpolates variables", () => {
    setNavigatorLanguage("en-US");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("3 total");
  });

  it("restores the stored locale", () => {
    localStorage.setItem("moneyos.locale", "ar");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
  });
});
