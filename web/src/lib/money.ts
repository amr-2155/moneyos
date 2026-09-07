/**
 * Integer-safe money conversion for the frontend.
 * Mirrors the backend's parseAmountToMinor (src/lib/money.ts).
 */

const DECIMAL_AMOUNT_RE = /^\d+(\.\d+)?$/;

/**
 * Parses a decimal amount string into integer minor units without
 * floating-point arithmetic. Rejects negative, zero-precision-incompatible,
 * or malformed input.
 *
 * Examples: "1500.50" → 150050; "1500" → 150000; "0.05" → 5.
 */
export function parseAmountToMinor(amount: string, currency = "EGP"): number {
  const normalized = amount.trim();
  if (!DECIMAL_AMOUNT_RE.test(normalized)) {
    throw new Error("Amount must be a non-negative decimal string");
  }

  const digits = minorDigitsForCurrency(currency);
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > digits) {
    throw new Error(
      `Amount exceeds the maximum of ${digits} decimal places for ${currency}`,
    );
  }

  const wholeMinor = parseInt(whole, 10) * 10 ** digits;
  const fractionPadded = fraction.padEnd(digits, "0");
  const fractionMinor = fractionPadded.length > 0 ? parseInt(fractionPadded, 10) : 0;

  if (!Number.isSafeInteger(wholeMinor) || !Number.isSafeInteger(fractionMinor)) {
    throw new Error("Amount is too large");
  }

  return wholeMinor + fractionMinor;
}

/** Returns the number of minor digits for a currency code (e.g. EGP → 2, JPY → 0). */
export function minorDigitsForCurrency(currency: string): number {
  const code = currency.toUpperCase();
  if (code === "JPY" || code === "KRW" || code === "VND") return 0;
  return 2;
}

/**
 * Converts minor units back to a decimal string.
 * Integer-safe (no floating-point division).
 */
export function minorToDecimal(minor: number, currency = "EGP"): string {
  const digits = minorDigitsForCurrency(currency);
  const scale = 10 ** digits;
  const absMinor = Math.abs(minor);
  const whole = Math.trunc(absMinor / scale);
  const fraction = absMinor % scale;
  const sign = minor < 0 ? "-" : "";
  if (digits === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(fraction).padStart(digits, "0")}`;
}
