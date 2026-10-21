/**
 * Recurring transaction rules.
 *
 * A rule describes an ongoing bill or income ("rent on the 1st", "salary on the
 * 25th") and can materialise its due occurrences into real transactions. The
 * engine is deliberately date-only and timezone-safe: everything works on
 * `YYYY-MM-DD` strings and builds dates with local constructors, never
 * `new Date("2026-01-01")`, which parses as UTC and can shift a day.
 */

export type Frequency = "weekly" | "monthly" | "yearly";

export interface RecurringRuleRecord {
  id: string;
  userId: string;
  name: string;
  accountId: string;
  categoryId: string | null;
  type: "income" | "expense";
  amountMinor: number;
  currency: string;
  frequency: Frequency;
  /** Anchor date the rule is aligned to; also the first occurrence. */
  startDate: string;
  /** Optional hard stop; past it the rule stops producing occurrences. */
  endDate: string | null;
  /** Days before the due date the reminder should appear. */
  remindDaysBefore: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const MS_PER_DAY = 86_400_000;

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Parses `YYYY-MM-DD` into a local-midnight Date, avoiding UTC parsing. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

export function toDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Adds `months` to a day, clamping the date to the end of the target month.
 */
export function addMonths(day: string, months: number): string {
  const source = parseDay(day);
  const targetMonth = source.getMonth() + months;
  const year = source.getFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const clamped = Math.min(source.getDate(), daysInMonth(year, monthIndex));
  return toDay(new Date(year, monthIndex, clamped));
}

/**
 * The nth occurrence of a rule, computed from the rule's anchor date.
 *
 * Deriving each step from the previous occurrence drifts: a rule anchored on the
 * 31st would go Jan 31 → Feb 28 → Mar 28 → Apr 28 forever. Anchoring every step
 * to the original day keeps "31st" meaning the 31st, falling back to the last
 * day of shorter months.
 */
function nthOccurrence(rule: RecurringRuleRecord, index: number): string {
  const anchor = parseDay(rule.startDate);
  const anchorDay = anchor.getDate();

  if (rule.frequency === "weekly") {
    return toDay(new Date(anchor.getTime() + index * 7 * MS_PER_DAY));
  }

  const step = rule.frequency === "monthly" ? index : index * 12;
  const targetMonth = anchor.getMonth() + step;
  const year = anchor.getFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(year, monthIndex));
  return toDay(new Date(year, monthIndex, day));
}

export function addDays(day: string, days: number): string {
  return toDay(new Date(parseDay(day).getTime() + days * MS_PER_DAY));
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / MS_PER_DAY);
}

/** The next due date strictly after `after`, or null once the rule is finished. */
export function nextOccurrence(rule: RecurringRuleRecord, after: string): string | null {
  if (rule.endDate && after >= rule.endDate) return null;

  // Bounded so a malformed rule can never spin forever.
  for (let index = 0; index < 2000; index += 1) {
    const candidate = nthOccurrence(rule, index);
    if (candidate > after) {
      if (rule.endDate && candidate > rule.endDate) return null;
      return candidate;
    }
  }
  return null;
}

/** Every due date from the rule's start up to and including `until`. */
export function occurrencesBetween(rule: RecurringRuleRecord, until: string): string[] {
  const results: string[] = [];

  for (let index = 0; index < 2000; index += 1) {
    const candidate = nthOccurrence(rule, index);
    if (candidate > until) break;
    if (rule.endDate && candidate > rule.endDate) break;
    results.push(candidate);
  }
  return results;
}

/**
 * Occurrences still to be materialised: those on or before `through`, and not
 * already recorded. `existingDates` holds `YYYY-MM-DD` values already linked to
 * this rule, so running the engine twice never duplicates a bill.
 */
export function pendingOccurrences(
  rule: RecurringRuleRecord,
  through: string,
  existingDates: ReadonlySet<string>,
): string[] {
  if (!rule.isActive) return [];
  return occurrencesBetween(rule, through).filter((day) => !existingDates.has(day));
}

/** The due date the reminder should fire for, or null when nothing is due yet. */
export function reminderDate(rule: RecurringRuleRecord, from: string): string | null {
  const next = nextOccurrence(rule, from);
  if (!next) return null;
  return rule.remindDaysBefore > 0 ? addDays(next, -rule.remindDaysBefore) : next;
}

/** Human-readable next due date, for list rows. */
export function describeNext(rule: RecurringRuleRecord, from: string): string | null {
  return nextOccurrence(rule, from);
}

export { daysBetween };