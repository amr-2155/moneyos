import { describe, expect, it, beforeEach } from "vitest";
import {
  contributionsInMonth,
  goalKind,
  loadDistribution,
  monthlyTargets,
  saveDistribution,
  spendingPct,
} from "./distribution";

describe("distribution", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("computes monthly targets from income percentages", () => {
    const targets = monthlyTargets(100000, { savingsPct: 30, investPct: 20 });
    expect(targets.savingsMinor).toBe(30000);
    expect(targets.investMinor).toBe(20000);
    expect(targets.spendingMinor).toBe(50000);
  });

  it("rounds targets without float drift", () => {
    const targets = monthlyTargets(33333, { savingsPct: 30, investPct: 10 });
    expect(targets.savingsMinor).toBe(10000);
    expect(targets.investMinor).toBe(3333);
    expect(targets.spendingMinor).toBe(20000);
    expect(targets.savingsMinor + targets.investMinor + targets.spendingMinor).toBe(33333);
  });

  it("derives spending as the remaining share", () => {
    expect(spendingPct({ savingsPct: 30, investPct: 20 })).toBe(50);
  });

  it("classifies goal names as savings or investment", () => {
    expect(goalKind("Emergency fund")).toBe("savings");
    expect(goalKind("Laptop")).toBe("savings");
    expect(goalKind("Invest in stocks")).toBe("investment");
    expect(goalKind("استثمار")).toBe("investment");
    expect(goalKind("محفظة استثمارية")).toBe("investment");
  });

  it("sums only the contributions of the requested month", () => {
    const month = "2026-08";
    const contributions = [
      { id: "c1", savingsGoalId: "g1", amount: "10.00", amountMinor: 1000, currency: "USD", note: null, createdAt: "2026-08-05T00:00:00.000Z" },
      { id: "c2", savingsGoalId: "g1", amount: "25.00", amountMinor: 2500, currency: "USD", note: null, createdAt: "2026-08-20T00:00:00.000Z" },
      { id: "c3", savingsGoalId: "g1", amount: "99.99", amountMinor: 9999, currency: "USD", note: null, createdAt: "2026-07-30T00:00:00.000Z" },
    ];
    expect(contributionsInMonth(contributions, month)).toBe(3500);
  });

  it("loads defaults when nothing is stored", () => {
    const distribution = loadDistribution();
    expect(distribution.savingsPct).toBe(30);
    expect(distribution.investPct).toBe(20);
  });

  it("round-trips a saved distribution", () => {
    saveDistribution({ savingsPct: 40, investPct: 25 });
    expect(loadDistribution()).toEqual({ savingsPct: 40, investPct: 25 });
  });

  it("falls back to defaults when percentages overflow 100", () => {
    localStorage.setItem("moneyos.distribution", JSON.stringify({ savingsPct: 80, investPct: 30 }));
    expect(loadDistribution()).toEqual({ savingsPct: 30, investPct: 20 });
  });

  it("clamps and ignores corrupt stored values", () => {
    localStorage.setItem("moneyos.distribution", JSON.stringify({ savingsPct: -5, investPct: 200 }));
    const distribution = loadDistribution();
    expect(distribution.savingsPct).toBe(0);
    expect(distribution.investPct).toBe(100);
  });
});
