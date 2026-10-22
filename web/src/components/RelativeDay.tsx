import { useI18n } from "../i18n";
import { formatDate } from "../lib/format";
import { formatRelativeDay } from "../lib/relativeDay";

/**
 * How long ago a transaction happened, e.g. "منذ ١١ يومًا" / "11 days ago".
 *
 * Deliberately quiet: it is context on a record, not a call to action, so it
 * sits in muted small type and fades in once rather than drawing the eye.
 * Renders nothing for unreadable dates instead of showing a broken label.
 */
export function RelativeDay({ date, className }: { date: string; className?: string }) {
  const { locale } = useI18n();
  const label = formatRelativeDay(date, locale);
  if (!label) return null;

  return (
    <span className={`rel-day${className ? ` ${className}` : ""}`} title={formatDate(date)}>
      {label}
    </span>
  );
}