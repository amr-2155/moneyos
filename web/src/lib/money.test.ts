/**
 * Frontend money precision tests — Phase 9.1
 *
 * Verifies integer-safe monetary conversion — NO floating-point arithmetic.
 * Tests edge cases identified by the production readiness audit.
 */
import { describe, expect, it } from "vitest";
import { parseAmountToMinor, minorToDecimal } from "./money";

describe("Phase 9.1: Money Precision (no floating-point)", () => {
  describe("parseAmountToMinor — integer-safe decimal parsing", () => {
    it("0.01 → 1 minor (not 0 or 1.0000001)", () => {
      expect(parseAmountToMinor("0.01", "EGP")).toBe(1);
      expect(parseAmountToMinor("0.01", "USD")).toBe(1);
    });

    it("0.10 → 10 minor (not 9 or 10.000000000000002)", () => {
      expect(parseAmountToMinor("0.10", "EGP")).toBe(10);
      expect(parseAmountToMinor("0.10", "USD")).toBe(10);
    });

    it("19.99 → 1999 minor (not 1998.9999999999998)", () => {
      expect(parseAmountToMinor("19.99", "EGP")).toBe(1999);
      expect(parseAmountToMinor("19.99", "USD")).toBe(1999);
    });

    it("39.97 → 3997 minor", () => {
      expect(parseAmountToMinor("39.97", "EGP")).toBe(3997);
    });

    it("999999999.99 → 99999999999 minor (no float overflow)", () => {
      expect(parseAmountToMinor("999999999.99", "USD")).toBe(99999999999);
    });

    it("1000.00 → 100000 minor", () => {
      expect(parseAmountToMinor("1000.00", "EGP")).toBe(100000);
    });

    it("500.00 → 50000 minor", () => {
      expect(parseAmountToMinor("500.00", "EGP")).toBe(50000);
    });

    it("handles trailing zeros correctly", () => {
      expect(parseAmountToMinor("1000.00", "EGP")).toBe(100000);
      expect(parseAmountToMinor("1000.0", "EGP")).toBe(100000);
      expect(parseAmountToMinor("1000", "EGP")).toBe(100000);
    });

    it("handles no decimal point", () => {
      expect(parseAmountToMinor("1000", "EGP")).toBe(100000);
    });

    it("integer amount with no decimals returns minor * 100", () => {
      expect(parseAmountToMinor("50", "EGP")).toBe(5000);
    });
  });

  describe("minorToDecimal — integer-safe formatting", () => {
    it("1 → 0.01", () => {
      expect(minorToDecimal(1, "EGP")).toBe("0.01");
    });

    it("10 → 0.10", () => {
      expect(minorToDecimal(10, "EGP")).toBe("0.10");
    });

    it("1999 → 19.99", () => {
      expect(minorToDecimal(1999, "EGP")).toBe("19.99");
    });

    it("3997 → 39.97", () => {
      expect(minorToDecimal(3997, "EGP")).toBe("39.97");
    });

    it("99999999999 → 999999999.99", () => {
      expect(minorToDecimal(99999999999, "USD")).toBe("999999999.99");
    });

    it("100000 → 1000.00 (two decimal places)", () => {
      expect(minorToDecimal(100000, "EGP")).toBe("1000.00");
    });
  });

  describe("No floating-point arithmetic is used", () => {
    it("0.10 is NOT 0.1 * 100 = 10.000000000000002", () => {
      // This is the classic float bug: 0.1 * 100 = 10.000000000000002
      // Our integer-safe parser returns exactly 10
      expect(parseAmountToMinor("0.10", "EGP")).toBe(10);
      expect(parseAmountToMinor("0.10", "EGP")).not.toBe(10.000000000000002);
    });

    it("19.99 is NOT 1998.9999999999998", () => {
      expect(parseAmountToMinor("19.99", "EGP")).toBe(1999);
      expect(parseAmountToMinor("19.99", "EGP")).not.toBe(1998.9999999999998);
    });

    it("0.01 is NOT 1.0000000000000002", () => {
      expect(parseAmountToMinor("0.01", "EGP")).toBe(1);
      expect(parseAmountToMinor("0.01", "EGP")).not.toBe(1.0000000000000002);
    });
  });
});
