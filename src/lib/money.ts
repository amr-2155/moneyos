/**
 * Money utilities.
 *
 * Monetary values are never stored or computed as floating-point numbers.
 * Amounts travel over the API as decimal strings (e.g. "1500.50") and are
 * stored/computed as integer minor units (e.g. 150050).
 */

import { CURRENCY_MINOR_DIGITS } from "./currencies.js";

const DEFAULT_MINOR_DIGITS = 2;

export function minorDigitsForCurrency(currency: string): number {
  return CURRENCY_MINOR_DIGITS[currency.toUpperCase()] ?? DEFAULT_MINOR_DIGITS;
}

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

/**
 * Parses a decimal amount string into integer minor units without floating-point
 * arithmetic. Rejects negative, zero-precision-incompatible, or malformed input.
 *
 * Examples: "1500.50" → 150050; "1500" → 150000; "0.05" → 5.
 */
export function parseAmountToMinor(amount: string, currency = "EGP"): number {
  const normalized = amount.trim();
  if (!DECIMAL_AMOUNT_RE.test(normalized)) {
    throw new InvalidAmountError("Amount must be a non-negative decimal string");
  }

  const digits = minorDigitsForCurrency(currency);
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > digits) {
    throw new InvalidAmountError(
      `Amount exceeds the maximum of ${digits} decimal places for ${currency}`,
    );
  }

  const wholeMinor = parseInt(whole, 10) * 10 ** digits;
  const fractionPadded = fraction.padEnd(digits, "0");
  const fractionMinor = fractionPadded.length > 0 ? parseInt(fractionPadded, 10) : 0;

  if (!Number.isSafeInteger(wholeMinor) || !Number.isSafeInteger(fractionMinor)) {
    throw new InvalidAmountError("Amount is too large");
  }

  const result = wholeMinor + fractionMinor;
  if (!Number.isSafeInteger(result)) {
    throw new InvalidAmountError("Amount is too large");
  }
  return result;
}

/**
 * Formats integer minor units as a decimal string with the currency's minor digits.
 * Example: 150050 → "1500.50".
 */
export function formatMinorToAmount(minor: number, currency = "EGP"): string {
  if (!Number.isSafeInteger(minor)) {
    throw new InvalidAmountError("Amount is not a safe integer");
  }
  const digits = minorDigitsForCurrency(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const factor = 10 ** digits;
  const whole = Math.trunc(abs / factor);
  if (digits === 0) {
    return `${negative ? "-" : ""}${whole}`;
  }
  const fraction = (abs % factor).toString().padStart(digits, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Integer-only division rounding half up, used for computed values such as
 * percentages (e.g. savings rate) without introducing floats in the result.
 */
export function divideRound(a: number, b: number, scale = 2): number {
  if (b === 0) {
    throw new Error("Cannot divide by zero");
  }
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new Error("divideRound expects integer inputs");
  }
  const factor = 10 ** scale;
  const signed = a >= 0 === b >= 0 ? 1 : -1;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const scaled = absA * factor;
  const quotient = Math.floor(scaled / absB);
  const remainder = scaled % absB;
  const rounded = remainder * 2 >= absB ? quotient + 1 : quotient;
  return signed * rounded;
}

/**
 * Computes `percent`% of a minor-units amount using integer math, rounding half
 * up. `percent` is 0–100; the result is in minor units.
 */
export function percentOf(amountMinor: number, percent: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("percentOf expects an integer amount");
  }
  if (percent < 0 || percent > 100) {
    throw new Error("percent must be between 0 and 100");
  }
  // Convert to basis points (1/10000) to keep all arithmetic integer-safe.
  const basisPoints = Math.round(percent * 100);
  const product = amountMinor * basisPoints;
  if (!Number.isSafeInteger(product)) {
    throw new Error("percentOf result is not a safe integer");
  }
  return divideRound(product, 10000, 0);
}
