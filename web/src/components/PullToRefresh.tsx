import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Distance in px the content must be pulled before a refresh is armed. */
const TRIGGER = 72;
/** Maximum pull distance, so the indicator never travels off-screen. */
const MAX_PULL = 120;
/** Ignore pulls while a modal, sheet or text input owns the gesture. */
const AXIS_LOCK_SLOP = 8;

export type PullState = "idle" | "pulling" | "armed" | "refreshing" | "done";

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  /** Renders the label under the indicator. Defaults to a translated string. */
  labels?: { pull?: string; release?: string; refreshing?: string };
  disabled?: boolean;
}

/**
 * Pull-to-refresh built on native touch/pointer events — no animation library,
 * no Tailwind, no extra bytes. The content translates while the user drags down
 * from the top of the scroll area, and the refresh fires once the pull passes
 * the trigger distance.
 */
export function PullToRefresh({ onRefresh, children, labels, disabled = false }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const startY = useRef<number | null>(null);
  const pointerActive = useRef(false);
  const busy = useRef(false);

  const reset = useCallback(() => {
    startY.current = null;
    pointerActive.current = false;
    setPullY(0);
    setState("idle");
  }, []);

  const release = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState("refreshing");
    setPullY(56);
    try {
      await onRefresh();
    } finally {
      setState("done");
      busy.current = false;
      // Let the "done" ring settle, then spring the content back to rest.
      window.setTimeout(reset, 420);
    }
  }, [onRefresh, reset]);

  const onTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (disabled || busy.current) return;
      // Only arm when the scroll area is already at the top.
      const scroller = event.currentTarget;
      if (scroller.scrollTop > 0) return;
      startY.current = event.touches[0]?.clientY ?? null;
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const origin = startY.current;
      if (origin === null || disabled || busy.current) return;

      const currentY = event.touches[0]?.clientY ?? origin;
      const delta = currentY - origin;

      if (delta <= 0) {
        if (pullY !== 0) {
          startY.current = currentY;
          setPullY(0);
          setState("idle");
        }
        return;
      }
      if (Math.abs(delta) < AXIS_LOCK_SLOP && !pointerActive.current) return;

      if (event.cancelable) event.preventDefault();

      // Rubber-band: resistance grows with distance.
      const eased = Math.min(MAX_PULL, delta * 0.5);
      setPullY(eased);
      setState(eased >= TRIGGER ? "armed" : "pulling");
    },
    [disabled, pullY],
  );

  const onTouchEnd = useCallback(() => {
    if (startY.current === null) return;
    const shouldRefresh = pullY >= TRIGGER && !busy.current;
    if (shouldRefresh) {
      void release();
    } else {
      reset();
    }
  }, [pullY, release, reset]);

  useEffect(() => {
    // Ignore the synthetic click that follows a completed pull gesture.
    if (!pointerActive.current) return;
    const swallow = (event: MouseEvent) => {
      if (pullY > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", swallow, true);
    return () => document.removeEventListener("click", swallow, true);
  }, [pullY]);

  const progress = Math.min(1, pullY / TRIGGER);
  const spin = state === "refreshing" || state === "done";
  const reducedMotion = usePrefersReducedMotion();

  const label =
    state === "refreshing" || state === "done"
      ? labels?.refreshing ?? "جاري التحديث…"
      : state === "armed"
        ? labels?.release ?? "أفلت للتحديث"
        : labels?.pull ?? "اسحب للأسفل للتحديث";

  return (
    <div className="ptr" data-state={state}>
      <div
        className="ptr-indicator"
        aria-hidden="true"
        style={{
          transform: `translate3d(0, ${pullY - 56}px, 0)`,
          opacity: Math.min(1, progress * 1.4),
          transition: spin || pullY === 0 ? "transform .3s ease, opacity .3s ease" : "none",
        }}
      >
        <span
          className={`ptr-spinner${spin ? " is-spinning" : ""}${reducedMotion ? " is-static" : ""}`}
          style={{ transform: `rotate(${progress * 270}deg)` }}
        />
      </div>

      <div
        className="ptr-content"
        style={{
          transform: pullY > 0 ? `translate3d(0, ${pullY}px, 0)` : "none",
          transition: spin || pullY === 0 ? "transform .3s cubic-bezier(.22,1,.36,1)" : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>

      <p className="ptr-sr" role="status" aria-live="polite">
        {spin ? label : ""}
      </p>
    </div>
  );
}

/** Tracks the reduced-motion preference so the spinner can stop rotating. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}