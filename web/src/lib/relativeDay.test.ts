import { describe, expect, it } from "vitest";
import { daysFromNow, formatRelativeDay } from "./relativeDay";

const NOW = new Date(2026, 9, 22); // 22 Oct 2026, local

describe("daysFromNow", () => {
  it("counts whole days between calendar dates", () => {
    expect(daysFromNow("2026-10-22", NOW)).toBe(0);
    expect(daysFromNow("2026-10-11", NOW)).toBe(11);
    expect(daysFromNow("2026-10-25", NOW)).toBe(-3);
  });

  it("is not confused by the UTC parsing of date-only strings", () => {
    // new Date("2026-10-22") is UTC midnight; in a negative-offset zone that is
    // still 21 Oct locally, which would report the wrong day.
    expect(daysFromNow("2026-10-22T23:30:00.000Z", NOW)).toBe(0);
  });

  it("handles month and year boundaries", () => {
    expect(daysFromNow("2026-09-30", NOW)).toBe(22);
    expect(daysFromNow("2025-10-22", NOW)).toBe(365);
  });

  it("returns null for input that is not a date", () => {
    expect(daysFromNow("", NOW)).toBeNull();
    expect(daysFromNow("not-a-date", NOW)).toBeNull();
    expect(daysFromNow("2026-13-01", NOW)).toBeNull();
  });
});

describe("formatRelativeDay", () => {
  it("uses words for today and yesterday", () => {
    expect(formatRelativeDay("2026-10-22", "en", NOW)).toBe("today");
    expect(formatRelativeDay("2026-10-21", "en", NOW)).toBe("yesterday");
  });

  it("reports past days the way a person would say them", () => {
    expect(formatRelativeDay("2026-10-11", "en", NOW)).toBe("11 days ago");
  });

  it("reports future dates as in N days", () => {
    expect(formatRelativeDay("2026-10-25", "en", NOW)).toBe("in 3 days");
  });

  it("switches to months and years once days stop being readable", () => {
    expect(formatRelativeDay("2026-09-12", "en", NOW)).toBe("last month");
    expect(formatRelativeDay("2024-10-22", "en", NOW)).toBe("2 years ago");
  });

  it("localises into Arabic, with Arabic plural agreement", () => {
    const today = formatRelativeDay("2026-10-22", "ar", NOW);
    const elevenDays = formatRelativeDay("2026-10-11", "ar", NOW);

    expect(today).toBe("اليوم");
    expect(elevenDays).toContain("يوم");
    expect(elevenDays).not.toContain("days");
  });

  it("returns an empty string when the date cannot be read", () => {
    expect(formatRelativeDay("nope", "en", NOW)).toBe("");
  });
});