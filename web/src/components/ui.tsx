import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { useI18n, type TranslationKey } from "../i18n";
import { useTheme, type ThemeMode } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

/* ------------------------------ Button ------------------------------ */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: IconName;
  block?: boolean;
  to?: string;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  block = false,
  to,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const sizeClass = size === "sm" ? " btn-sm" : size === "lg" ? " btn-lg" : "";
  const classes = `btn btn-${variant}${sizeClass}${block ? " btn-block" : ""} ${className}`;
  const content = (
    <>
      {loading ? <span className="btn-spinner" aria-hidden /> : null}
      {icon && !loading ? <Icon name={icon} size={16} /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} onClick={(event) => event.currentTarget.blur()}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }>(
  function IconButton({ icon, label, className = "", ...rest }, ref) {
    return (
      <button ref={ref} type="button" className={`icon-btn ${className}`} aria-label={label} {...rest}>
        <Icon name={icon} />
      </button>
    );
  },
);

/* ------------------------------ Forms ------------------------------ */
export function Field({
  label,
  hint,
  affix,
  children,
}: {
  label: string;
  hint?: string;
  /** Optional control rendered inside the input row (e.g. a reveal button). */
  affix?: ReactNode;
  children: ReactNode;
}) {
  const autoId = useId();
  const hintId = useId();

  const childProps = isValidElement<Record<string, unknown>>(children)
    ? (children.props as { id?: string; "aria-describedby"?: string })
    : undefined;
  const controlId = childProps?.id ?? autoId;
  const describedBy = [childProps?.["aria-describedby"], hint ? hintId : undefined]
    .filter(Boolean)
    .join(" ");

  // Wire the label and the hint to the control explicitly. Keeping the hint
  // *outside* the <label> matters: otherwise it becomes part of the field's
  // accessible name ("Password At least 8 characters") instead of a description.
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy || undefined,
      })
    : children;

  return (
    <div className="field">
      <label className="field-label" htmlFor={controlId}>
        {label}
      </label>
      {affix ? (
        <div className="input-affix">
          {control}
          {affix}
        </div>
      ) : (
        control
      )}
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="field-row">{children}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`select ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${props.className ?? ""}`} />;
}

/* ---------------------------- Page header ---------------------------- */
export function PageHeader({
  title,
  subtitle,
  controls,
  actions,
}: {
  title: string;
  subtitle?: string;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {controls || actions ? (
        <div className="page-header-actions">
          {controls}
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Card ------------------------------ */
export function Card({
  title,
  action,
  className = "",
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <h3 className="card-title">
          <span>{title}</span>
          {action}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------ Badge ------------------------------ */
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/* ------------------------------ Progress ------------------------------ */
export type ProgressTone = "primary" | "positive" | "warning" | "danger" | "invest";

export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: ProgressTone }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill ${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/* ------------------------------ Stats ------------------------------ */
export function StatCard({
  label,
  value,
  format,
  tone = "neutral",
  sub,
  icon,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  tone?: "neutral" | "positive" | "negative" | "invest";
  sub?: ReactNode;
  icon?: IconName;
}) {
  const valueClass =
    tone === "positive" ? " positive" : tone === "negative" ? " negative" : tone === "invest" ? " invest" : "";
  return (
    <div className="stat-card">
      <div className="stat-label">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </div>
      <div className={`stat-value${valueClass}`}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------ Empty state ------------------------------ */
export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
  action,
  children,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? " empty-compact" : ""}`}>
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3 className="empty-title">{title}</h3>
      {subtitle ? <p className="empty-sub">{subtitle}</p> : null}
      {action ? <div>{action}</div> : null}
      {children ? <div>{children}</div> : null}
    </div>
  );
}

/* ------------------------------ Skeleton ------------------------------ */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-card" aria-hidden>
      <div className="skeleton" style={{ width: "40%", height: 18, marginBottom: 14 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ width: "55%", height: 13, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: "35%", height: 11 }} />
          </div>
          <div className="skeleton" style={{ width: 70, height: 16 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ width, height }: { width?: number | string; height?: number | string }) {
  return <div className="skeleton" style={{ width: width ?? "100%", height: height ?? 14 }} aria-hidden />;
}

/* ------------------------------ Modal ------------------------------ */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton ref={closeRef} icon="x" label={t("common.close")} onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "neutral",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "neutral" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted">{message}</p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Segmented control ------------------------------ */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: IconName; className?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-btn ${option.className ?? ""}${value === option.value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <Icon name={option.icon} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Animated number ------------------------------ */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) {
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 350;
    let raf = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}

/* ------------------------------ Theme selector ------------------------------ */
const THEME_OPTIONS: { value: ThemeMode; icon: IconName; labelKey: TranslationKey; hintKey?: TranslationKey }[] = [
  { value: "system", icon: "monitor", labelKey: "settings.themeSystem", hintKey: "settings.themeSystemHint" },
  { value: "light", icon: "sun", labelKey: "settings.themeLight", hintKey: "settings.themeLightHint" },
  { value: "dark", icon: "moon", labelKey: "settings.themeDark", hintKey: "settings.themeDarkHint" },
];

export function ThemeSelector({ variant = "grid" }: { variant?: "grid" | "menu" }) {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();

  if (variant === "menu") {
    return (
      <>
        <div className="menu-section">{t("settings.appearance")}</div>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="menu-item"
            onClick={() => setMode(option.value)}
            aria-pressed={mode === option.value}
          >
            <Icon name={option.icon} />
            <span style={{ flex: 1 }}>{t(option.labelKey)}</span>
            {mode === option.value ? <Icon name="check" size={16} /> : null}
          </button>
        ))}
      </>
    );
  }

  return (
    <div className="option-grid" role="radiogroup" aria-label={t("settings.appearance")}>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          className={`option-card${mode === option.value ? " active" : ""}`}
          onClick={() => setMode(option.value)}
        >
          <Icon name={option.icon} />
          <span>{t(option.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Language selector ------------------------------ */
const LANGUAGES: { value: "en" | "ar"; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

export function LanguageSelector({ variant = "grid" }: { variant?: "grid" | "menu" }) {
  const { locale, setLocale, t } = useI18n();

  if (variant === "menu") {
    return (
      <>
        <div className="menu-section">{t("settings.language")}</div>
        {LANGUAGES.map((language) => (
          <button
            key={language.value}
            type="button"
            className="menu-item"
            onClick={() => setLocale(language.value)}
            aria-pressed={locale === language.value}
          >
            <Icon name="globe" />
            <span style={{ flex: 1 }}>{language.label}</span>
            {locale === language.value ? <Icon name="check" size={16} /> : null}
          </button>
        ))}
      </>
    );
  }

  return (
    <div className="option-grid" role="radiogroup" aria-label={t("settings.language")}>
      {LANGUAGES.map((language) => (
        <button
          key={language.value}
          type="button"
          role="radio"
          aria-checked={locale === language.value}
          className={`option-card${locale === language.value ? " active" : ""}`}
          onClick={() => setLocale(language.value)}
        >
          <Icon name="globe" />
          <span>{language.label}</span>
        </button>
      ))}
    </div>
  );
}
