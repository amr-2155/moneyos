/** Supported ISO 4217 currencies for the MVP. */
export const SUPPORTED_CURRENCIES = [
  "EGP",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "KWD",
  "BHD",
  "JPY",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO 4217 → number of minor (fractional) digits. */
export const CURRENCY_MINOR_DIGITS: Record<string, number> = {
  EGP: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SAR: 2,
  KWD: 3,
  BHD: 3,
  JPY: 0,
};
