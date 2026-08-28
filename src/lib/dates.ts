/**
 * Date handling strategy.
 *
 * Financial transaction dates are date-only values (`YYYY-MM-DD`) stored as
 * text. They represent the user's local calendar day and are never shifted by
 * browser/server timezone conversions. Month reporting (`YYYY-MM`) is derived
 * from the same string values with lexicographic range queries.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Returns today's date as `YYYY-MM-DD` in the local timezone. */
export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidMonthStr(value: string): boolean {
  if (!MONTH_RE.test(value)) {
    return false;
  }
  const [, month] = value.split("-").map(Number);
  return month! >= 1 && month! <= 12;
}

export interface MonthRange {
  start: string;
  end: string;
}

/** Inclusive `YYYY-MM-DD` range for a `YYYY-MM` month, handling month lengths. */
export function monthRange(month: string): MonthRange {
  if (!isValidMonthStr(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNum!, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Current month as `YYYY-MM` in the local timezone. */
export function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

/** Adds `offset` months to a `YYYY-MM` value, handling year rollover. */
export function addMonths(month: string, offset: number): string {
  if (!isValidMonthStr(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const [year, monthNum] = month.split("-").map(Number);
  const total = (year! - 1) * 12 + (monthNum! - 1) + offset;
  const resultYear = Math.floor(total / 12) + 1;
  const resultMonth = (total % 12) + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, "0")}`;
}

/** Returns the last `count` `YYYY-MM` values ending at (and including) `endMonth`. */
export function lastNMonths(endMonth: string, count: number): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(addMonths(endMonth, -i));
  }
  return months;
}
