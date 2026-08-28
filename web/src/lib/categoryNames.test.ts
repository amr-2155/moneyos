import { describe, expect, it } from "vitest";
import { localizeCategoryName } from "./categoryNames";

describe("localizeCategoryName", () => {
  it("maps English seed names to Arabic when the locale is Arabic", () => {
    expect(localizeCategoryName("Food & Dining", "ar")).toBe("أكل وشرب");
    expect(localizeCategoryName("Salary", "ar")).toBe("راتب");
    expect(localizeCategoryName("Transport", "ar")).toBe("مواصلات");
  });

  it("keeps English names in the English locale", () => {
    expect(localizeCategoryName("Food & Dining", "en")).toBe("Food & Dining");
    expect(localizeCategoryName("Salary", "en")).toBe("Salary");
  });

  it("falls back to the raw name for unknown categories", () => {
    expect(localizeCategoryName("Cinema", "ar")).toBe("Cinema");
    expect(localizeCategoryName("Cinema", "en")).toBe("Cinema");
  });

  it("maps Arabic names back to English when the locale is English", () => {
    expect(localizeCategoryName("أكل وشرب", "en")).toBe("Food & Dining");
    expect(localizeCategoryName("راتب", "en")).toBe("Salary");
  });
});
