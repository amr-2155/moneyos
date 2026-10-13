import { useId, type InputHTMLAttributes } from "react";

interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  /** ISO `YYYY-MM-DD` value, or empty when no date is chosen. */
  value: string;
  onChange: (isoDate: string) => void;
  /**
   * Formatted echo of the chosen date, e.g. "الثلاثاء، 11 أكتوبر 2026".
   * Rendering the browser's raw `mm/dd/yyyy` is the least readable part of a
   * native date input, so the picked date is always spelled out underneath.
   */
  formatValue?: (isoDate: string) => string | null;
  /** Hint shown while the field is still empty. */
  emptyHint?: string;
  /** Where to anchor the native picker so it opens toward free space. */
  align?: "start" | "center" | "end";
}

/**
 * A themed date input that keeps the native picker (so the OS calendar, keyboard
 * support and mobile wheel all keep working) while fixing the two things users
 * actually complain about: the US-style placeholder and the invisible calendar
 * icon in dark mode.
 */
export function DateField({
  value,
  onChange,
  formatValue,
  emptyHint,
  align = "start",
  min,
  max,
  required,
  autoFocus,
  ...rest
}: DateFieldProps) {
  const id = useId();
  const describedBy = emptyHint || value ? `${id}-hint` : undefined;
  const preview = value && formatValue ? formatValue(value) : null;

  return (
    <div className="date-field">
      <input
        {...rest}
        id={id}
        type="date"
        className="input"
        value={value}
        min={min}
        max={max}
        required={required}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        // Lets the browser pick a sensible calendar layout for the page locale
        // instead of defaulting to the US order on some platforms.
        lang="en-GB"
        data-align={align}
      />

      <p
        id={describedBy}
        className={`date-hint${preview ? " has-value" : ""}`}
        aria-live="polite"
      >
        {preview ?? emptyHint ?? null}
      </p>
    </div>
  );
}