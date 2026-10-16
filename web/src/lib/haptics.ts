/**
 * Light haptic feedback.
 *
 * No-ops on desktop and wherever the Vibration API is unavailable, so it is
 * always safe to call. Deliberately not wrapped in a hook: callers fire it from
 * event handlers, where a hook would add subscription churn for no benefit.
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [12, 60, 18],
  warning: [24, 70, 24],
  error: [45, 70, 45],
};

function supported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Fires a haptic pattern, respecting the reduced-motion preference. */
export function haptic(pattern: HapticPattern = "light"): void {
  if (!supported()) return;
  // Users who ask for less motion get less of every kind, including haptics.
  try {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
  } catch {
    // matchMedia unavailable: fall through and vibrate.
  }
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when the page is not visible; haptics are optional.
  }
}