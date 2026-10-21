import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  nextOccurrence,
  occurrencesBetween,
  parseDay,
  pendingOccurrences,
  reminderDate,
  toDay,
  type RecurringRuleRecord,
} from "./recurring";

function rule(overrides: Partial<RecurringRuleRecord> = {}): RecurringRuleRecord {
  return {
    id: "r1",
    userId: "u1",
    name: "Rent",
    accountId: "a1",
    categoryId: "c1",
    type: "expense",
    amountMinor: 200_000,
    currency: "EGP",
    frequency: "monthly",
    startDate: "2026-01-01",
    endDate: null,
    remindDaysBefore: 3,
    description: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("recurring date helpers", () => {
  it("parses and formats a day without drifting across timezones", () => {
    expect(toDay(parseDay("2026-03-01"))).toBe("2026-03-01");
    expect(toDay(parseDay("2026-12-31"))).toBe("2026-12-31");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months normally", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("clamps to the end of a short month instead of skipping it", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("handles a leap-year February", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("keeps the anchor day after clamping a short month", () => {
    // Jan 31 -> Feb 28 -> must return to Mar 31, not drift to the 28th.
    const rule31 = rule({ startDate: "2026-01-31" });
    expect(occurrencesBetween(rule31, "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("returns to the anchor day across a leap year", () => {
    const rule31 = rule({ startDate: "2028-01-31" });
    expect(occurrencesBetween(rule31, "2028-04-30")).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
      "2028-04-30",
    ]);
  });
});

describe("occurrencesBetween", () => {
  it("lists weekly occurrences", () => {
    const weekly = rule({ frequency: "weekly", startDate: "2026-01-05" });
    expect(occurrencesBetween(weekly, "2026-02-02")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
      "2026-02-02",
    ]);
  });

  it("lists yearly occurrences", () => {
    const yearly = rule({ frequency: "yearly", startDate: "2024-06-01" });
    expect(occurrencesBetween(yearly, "2026-12-31")).toEqual([
      "2024-06-01",
      "2025-06-01",
      "2026-06-01",
    ]);
  });

  it("stops at the end date", () => {
    const limited = rule({ startDate: "2026-01-01", endDate: "2026-03-01" });
    expect(occurrencesBetween(limited, "2026-12-31")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("returns nothing when the rule starts after the window", () => {
    const future = rule({ startDate: "2027-01-01" });
    expect(occurrencesBetween(future, "2026-12-31")).toEqual([]);
  });
});

describe("nextOccurrence", () => {
  it("finds the next monthly date", () => {
    expect(nextOccurrence(rule({ startDate: "2026-01-01" }), "2026-03-15")).toBe("2026-04-01");
  });

  it("skips a month already covered today", () => {
    expect(nextOccurrence(rule({ startDate: "2026-01-01" }), "2026-04-01")).toBe("2026-05-01");
  });

  it("returns the start date when it is still ahead", () => {
    expect(nextOccurrence(rule({ startDate: "2026-12-01" }), "2026-06-01")).toBe("2026-12-01");
  });

  it("returns null once the end date has passed", () => {
    const limited = rule({ startDate: "2026-01-01", endDate: "2026-03-01" });
    expect(nextOccurrence(limited, "2026-04-01")).toBeNull();
  });

  it("terminates on a malformed rule instead of looping", () => {
    const broken = rule({ startDate: "2020-01-01", endDate: "2020-02-01" });
    expect(nextOccurrence(broken, "2030-01-01")).toBeNull();
  });
});

describe("pendingOccurrences", () => {
  it("skips occurrences already recorded", () => {
    const existing = new Set(["2026-01-01", "2026-02-01"]);
    expect(pendingOccurrences(rule(), "2026-03-15", existing)).toEqual(["2026-03-01"]);
  });

  it("produces nothing for an inactive rule", () => {
    expect(pendingOccurrences(rule({ isActive: false }), "2026-03-15", new Set())).toEqual([]);
  });

  it("is idempotent: running twice adds nothing new", () => {
    const existing = new Set<string>();
    const first = pendingOccurrences(rule(), "2026-03-15", existing);
    first.forEach((day) => existing.add(day));

    expect(pendingOccurrences(rule(), "2026-03-15", existing)).toEqual([]);
  });

  it("respects the end date", () => {
    const limited = rule({ startDate: "2026-01-01", endDate: "2026-02-01" });
    expect(pendingOccurrences(limited, "2026-06-01", new Set())).toEqual([
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("reminderDate", () => {
  it("moves the reminder earlier by the configured lead time", () => {
    expect(reminderDate(rule({ remindDaysBefore: 3 }), "2026-03-15")).toBe("2026-03-29");
  });

  it("equals the due date when there is no lead time", () => {
    expect(reminderDate(rule({ remindDaysBefore: 0 }), "2026-03-15")).toBe("2026-04-01");
  });

  it("returns null when the rule is finished", () => {
    const limited = rule({ startDate: "2026-01-01", endDate: "2026-02-01" });
    expect(reminderDate(limited, "2026-05-01")).toBeNull();
  });
});