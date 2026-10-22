import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

type ToastKind = "success" | "error";

/** A single reversible follow-up shown inside the toast (e.g. "Undo"). */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Overrides the lifetime; actionable toasts default to a longer window. */
  duration?: number;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 4000;
/** Reversible toasts need long enough to actually be read and clicked. */
const ACTION_DURATION = 7000;

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, kind, message, action: options?.action }]);
      const duration = options?.duration ?? (options?.action ? ACTION_DURATION : DEFAULT_DURATION);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  const icons: Record<ToastKind, IconName> = { success: "check", error: "alert" };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <Icon name={icons[toast.kind]} />
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.onAction();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}