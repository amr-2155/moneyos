import { describe, expect, it } from "vitest";
import {
  divideRound,
  formatMinorToAmount,
  InvalidAmountError,
  minorDigitsForCurrency,
  parseAmountToMinor,
  percentOf,
} from "../src/lib/money.js";

describe("minorDigitsForCurrency", () => {
  it("returns 2 digits for EGP/USD/EUR/GBP", () => {
    expect(minorDigitsForCurrency("EGP")).toBe(2);
    expect(minorDigitsForCurrency("usd")).toBe(2);
    expect(minorDigitsForCurrency("EUR")).toBe(2);
    expect(minorDigitsForCurrency("GBP")).toBe(2);
  });

  it("handles 3-digit and 0-digit currencies", () => {
    expect(minorDigitsForCurrency("KWD")).toBe(3);
    expect(minorDigitsForCurrency("JPY")).toBe(0);
  });

  it("defaults unknown currencies to 2 digits", () => {
    expect(minorDigitsForCurrency("XYZ")).toBe(2);
  });
});

describe("parseAmountToMinor", () => {
  it("parses whole and fractional amounts without floats", () => {
    expect(parseAmountToMinor("0", "EGP")).toBe(0);
    expect(parseAmountToMinor("1500", "EGP")).toBe(150000);
    expect(parseAmountToMinor("1500.5", "EGP")).toBe(150050);
    expect(parseAmountToMinor("1500.50", "EGP")).toBe(150050);
    expect(parseAmountToMinor("0.05", "EGP")).toBe(5);
    expect(parseAmountToMinor("1000000.00", "EGP")).toBe(100000000);
  });

  it("parses leading zeros and extra whitespace", () => {
    expect(parseAmountToMinor("  007.07  ", "EGP")).toBe(707);
    expect(parseAmountToMinor("0.10", "EGP")).toBe(10);
  });

  it("parses 0-digit currencies", () => {
    expect(parseAmountToMinor("500", "JPY")).toBe(500);
  });

  it("parses 3-digit currencies", () => {
    expect(parseAmountToMinor("1.250", "KWD")).toBe(1250);
  });

  it("rejects negative amounts", () => {
    expect(() => parseAmountToMinor("-5", "EGP")).toThrow(InvalidAmountError);
  });

  it("rejects malformed input", () => {
    expect(() => parseAmountToMinor("", "EGP")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinor("abc", "EGP")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinor("1.2.3", "EGP")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinor("1,000", "EGP")).toThrow(InvalidAmountError);
  });

  it("rejects amounts with more decimals than the currency supports", () => {
    expect(() => parseAmountToMinor("1.001", "EGP")).toThrow(InvalidAmountError);
    expect(() => parseAmountToMinor("1.1", "JPY")).toThrow(InvalidAmountError);
  });

  it("rejects unsafe integers", () => {
    expect(() => parseAmountToMinor("9007199254740991", "EGP")).toThrow(InvalidAmountError);
  });
});

describe("formatMinorToAmount", () => {
  it("formats minor units back to decimal strings", () => {
    expect(formatMinorToAmount(0, "EGP")).toBe("0.00");
    expect(formatMinorToAmount(5, "EGP")).toBe("0.05");
    expect(formatMinorToAmount(150050, "EGP")).toBe("1500.50");
    expect(formatMinorToAmount(150000, "EGP")).toBe("1500.00");
  });

  it("round-trips parse -> format", () => {
    for (const amount of ["0.00", "0.01", "99.99", "1234.56", "1.10", "0.05"]) {
      expect(formatMinorToAmount(parseAmountToMinor(amount, "EGP"), "EGP")).toBe(amount);
    }
  });

  it("handles negative minor units", () => {
    expect(formatMinorToAmount(-150050, "EGP")).toBe("-1500.50");
  });

  it("formats zero-digit currencies without decimals", () => {
    expect(formatMinorToAmount(500, "JPY")).toBe("500");
  });
});

describe("divideRound", () => {
  it("rounds half up", () => {
    expect(divideRound(1, 2, 2)).toBe(50);
    expect(divideRound(1, 3, 2)).toBe(33);
    expect(divideRound(2, 3, 2)).toBe(67);
  });

  it("scales by the requested digits", () => {
    expect(divideRound(1, 2, 0)).toBe(1);
    expect(divideRound(1, 3, 0)).toBe(0);
    expect(divideRound(250000, 300000, 2)).toBe(83);
  });

  it("handles signs", () => {
    expect(divideRound(-1, 2, 2)).toBe(-50);
    expect(divideRound(1, -2, 2)).toBe(-50);
    expect(divideRound(-1, -2, 2)).toBe(50);
  });

  it("rejects division by zero", () => {
    expect(() => divideRound(1, 0, 2)).toThrow(/zero/);
  });
});

describe("percentOf", () => {
  it("computes a percentage of a minor amount using integer math", () => {
    expect(percentOf(100000, 50)).toBe(50000);
    expect(percentOf(150050, 100)).toBe(150050);
    expect(percentOf(0, 80)).toBe(0);
  });

  it("rounds half up", () => {
    // 1 minor unit * 50% = 0.5 -> rounds up to 1
    expect(percentOf(1, 50)).toBe(1);
    expect(percentOf(1, 49)).toBe(0);
  });
});
