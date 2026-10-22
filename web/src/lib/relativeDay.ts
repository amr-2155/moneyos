const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  const tag = locale === "ar" ? "ar-EG" : "en";
  let formatter = formatters.get(tag);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    formatters.set(tag, formatter);
  }
  return formatter;
}

/**
 * Parses the date part of an ISO string without going through Date's UTC
 * parsing, which can move a date-only value to the previous day in negative
 * offsets. Returns null for anything that is not YYYY-MM-DD.
 */
function parseDay(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Whole days from `date` to `now`, in local calendar terms. Negative means the
 * date is in the past. Comparing UTC midnights of the two calendar days keeps
 * the result stable across DST changes.
 */
export function daysFromNow(date: string, now: Date = new Date()): number | null {
  const day = parseDay(date);
  if (!day) return null;
  const target = Date.UTC(day.year, day.month - 1, day.day);
  const reference = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((reference - target) / DAY_MS);
}

/**
 * "11 days ago" / "قبل ١١ يومًا", "yesterday" / "أمس", "in 3 days" /
 * "بعد ٣ أيام".
 *
 * Days stay explicit for a month, which is the range where they are easy to
 * reason about; past that months and years read better than "247 days ago".
 */
export function formatRelativeDay(date: string, locale: string, now: Date = new Date()): string {
  const elapsed = daysFromNow(date, now);
  if (elapsed === null) return "";

  const magnitude = Math.abs(elapsed);
  const signed = -elapsed;
  const formatter = relativeFormatter(locale);

  if (magnitude < 30) return formatter.format(signed, "day");
  if (magnitude < 365) return formatter.format(-Math.round(elapsed / 30), "month");
  return formatter.format(-Math.round(elapsed / 365), "year");
}