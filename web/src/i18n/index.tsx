import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setLocaleForFormat } from "../lib/format";
import { ar } from "./ar";
import { en, type EnMessages } from "./en";

export type Locale = "en" | "ar";
export type Messages = EnMessages;

type LeafPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends object
      ? LeafPaths<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export type TranslationKey = LeafPaths<Messages>;

const LOCALE_KEY = "moneyos.locale";

const dictionaries: Record<Locale, Messages> = { en, ar };

function getInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "en" || stored === "ar") {
    return stored;
  }
  return (navigator.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en";
}

function setDocumentLocale(locale: Locale): void {
  document.documentElement.setAttribute("lang", locale);
  document.documentElement.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

function lookup(messages: Messages, key: TranslationKey): string {
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
  return typeof value === "string" ? value : key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

interface I18nContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    setDocumentLocale(locale);
    setLocaleForFormat(locale);
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(lookup(dictionaries[locale], key), vars),
    [locale],
  );

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: locale === "ar" ? "rtl" : "ltr", t, setLocale }),
    [locale, t, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
