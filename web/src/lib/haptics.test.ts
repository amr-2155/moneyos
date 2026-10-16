import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haptic } from "./haptics";

describe("haptic", () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vibrate.mockClear();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: vibrate,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setReducedMotion(reduce: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  }

  it("fires the light pattern by default", () => {
    setReducedMotion(false);
    haptic();

    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("uses a distinct multi-pulse pattern for success", () => {
    setReducedMotion(false);
    haptic("success");

    expect(vibrate).toHaveBeenCalledWith([12, 60, 18]);
  });

  it("uses a distinct multi-pulse pattern for error", () => {
    setReducedMotion(false);
    haptic("error");

    expect(vibrate).toHaveBeenCalledWith([45, 70, 45]);
  });

  it("stays silent when the user prefers reduced motion", () => {
    setReducedMotion(true);
    haptic("success");

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing when the Vibration API is unavailable", () => {
    setReducedMotion(false);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(() => haptic("heavy")).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a throw from a browser that blocks vibration", () => {
    setReducedMotion(false);
    vibrate.mockImplementation(() => {
      throw new Error("not allowed");
    });

    expect(() => haptic("light")).not.toThrow();
  });
});