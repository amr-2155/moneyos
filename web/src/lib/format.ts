let currentLocale = "en";

export function setLocaleForFormat(locale: string): void {
  currentLocale = locale;
}

const MINOR_DIGITS: Record<string, number> = {
  JPY: 0,
};

function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/**
 * Labels for currencies whose localized display must never fall back to a
 * confusing symbol (e.g. Intl renders EGP as "£"/"E£" in English locales).
 * EGP always shows "ج.م" in Arabic and "EGP" in English — never a pound sign.
 */
const CURRENCY_LABELS: Record<string, { ar: string; en: string }> = {
  EGP: { ar: "ج.م", en: "EGP" },
  AED: { ar: "د.إ", en: "AED" },
  SAR: { ar: "ر.س", en: "SAR" },
  KWD: { ar: "د.ك", en: "KWD" },
  BHD: { ar: "د.ب", en: "BHD" },
};

/** Returns the localized label for a currency code ("ج.م", "$", "€", …). */
export function currencyLabel(currency: string): string {
  const code = currency.toUpperCase();
  const label = CURRENCY_LABELS[code];
  if (label) {
    return currentLocale === "ar" ? label.ar : label.en;
  }
  try {
    const parts = new Intl.NumberFormat(currentLocale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/**
 * Formats an integer amount (minor units) as a localized currency string.
 * The single entry point for every money value in the app: Dashboard,
 * Transactions, Reports, Goals, Budgets, Charts and Forms all go through here.
 */
export function formatCurrency(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  const code = currency.toUpperCase();
  if (CURRENCY_LABELS[code]) {
    const number = new Intl.NumberFormat(currentLocale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
    return `${number} ${currencyLabel(code)}`;
  }
  try {
    return new Intl.NumberFormat(currentLocale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${code}`;
  }
}

/** Formats an integer amount (minor units) as a plain localized number. */
export function formatAmount(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(currentLocale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

/** Converts an integer amount (minor units) into an editable decimal string. */
export function minorToDecimal(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  return value.toFixed(digits);
}

/** Formats a number as a localized percent string. Accepts 0–100. */
export function formatPercent(percent: number): string {
  try {
    return new Intl.NumberFormat(currentLocale, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(percent / 100);
  } catch {
    return `${percent}%`;
  }
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) {
    return month;
  }
  try {
    return new Intl.DateTimeFormat(currentLocale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, m - 1, 1)));
  } catch {
    return month;
  }
}

export function formatDate(date: string): string {
  try {
    return new Intl.DateTimeFormat(currentLocale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00`));
  } catch {
    return date;
  }
}

export function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "AED", "SAR", "KWD", "BHD", "JPY"] as const;
