import { describe, expect, it } from "vitest";
import { currencyLabel, formatAmount, formatCurrency, formatMonth, formatPercent, minorToDecimal, setLocaleForFormat } from "./format";

describe("format", () => {
  it("formats currency with narrow symbol and locale grouping", () => {
    setLocaleForFormat("en");
    expect(formatCurrency(123456, "USD")).toBe("$1,234.56");
  });

  it("uses zero decimal digits for JPY", () => {
    setLocaleForFormat("en");
    expect(formatCurrency(1234, "JPY")).toMatch(/1,234/);
  });

  it("keeps the stored minor-unit value intact across locale switches", () => {
    setLocaleForFormat("en");
    const en = formatCurrency(123456, "USD");
    setLocaleForFormat("ar");
    const ar = formatCurrency(123456, "USD");
    // Both render the same underlying value (1234.56) in their own locale form.
    expect(en.replace(/\D/g, "")).toBe(ar.replace(/\D/g, ""));
  });

  it("formats negative amounts", () => {
    setLocaleForFormat("en");
    expect(formatCurrency(-5000, "USD")).toBe("-$50.00");
  });

  it("always renders EGP as ج.م in Arabic, never a pound sign", () => {
    setLocaleForFormat("ar");
    expect(formatCurrency(150000, "EGP")).toContain("ج.م");
    expect(formatCurrency(150000, "EGP")).not.toMatch(/£|E£/);
  });

  it("renders EGP as a clear code in English, never a pound sign", () => {
    setLocaleForFormat("en");
    expect(formatCurrency(150000, "EGP")).toBe("1,500.00 EGP");
    expect(formatCurrency(150000, "EGP")).not.toMatch(/£|E£/);
  });

  it("exposes localized currency labels", () => {
    setLocaleForFormat("ar");
    expect(currencyLabel("EGP")).toBe("ج.م");
    expect(currencyLabel("AED")).toBe("د.إ");
    expect(currencyLabel("SAR")).toBe("ر.س");
    setLocaleForFormat("en");
    expect(currencyLabel("EGP")).toBe("EGP");
    expect(currencyLabel("USD")).toBe("$");
  });

  it("formats plain localized numbers", () => {
    setLocaleForFormat("en");
    expect(formatAmount(123456, "USD")).toBe("1,234.56");
  });

  it("formats percents without converting input", () => {
    setLocaleForFormat("en");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(12.5)).toBe("12.5%");
  });

  it("converts minor units to editable decimals honoring currency digits", () => {
    setLocaleForFormat("en");
    expect(minorToDecimal(123456, "USD")).toBe("1234.56");
    expect(minorToDecimal(1234, "JPY")).toBe("1234");
  });

  it("formats month labels", () => {
    setLocaleForFormat("en");
    expect(formatMonth("2026-08")).toContain("2026");
    expect(formatMonth("garbage")).toBe("garbage");
  });
});
