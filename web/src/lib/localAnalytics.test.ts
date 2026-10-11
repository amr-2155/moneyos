import { beforeEach, describe, expect, it } from "vitest";
import { db, uid } from "./db";
import { setActiveUserId } from "./session";
import {
  localBudgetPerformance,
  localCategoryBreakdown,
  localMonthlySummary,
  localNetWorthTrend,
  localPeriodComparison,
  localSavingsGoalProgress,
} from "./localAnalytics";

const USER = "local-test-user";

async function seedAccount(overrides: Partial<Record<string, unknown>> = {}) {
  await db.accounts.put({
    id: "acc1",
    userId: USER,
    name: "Cash",
    type: "cash",
    currency: "EGP",
    openingBalanceMinor: 0,
    isActive: true,
    archived: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as never);
}

async function seedTx(tx: Partial<Record<string, unknown>>) {
  await db.transactions.put({
    id: uid(),
    userId: USER,
    accountId: "acc1",
    categoryId: null,
    type: "expense",
    amountMinor: 0,
    currency: "EGP",
    description: null,
    notes: null,
    date: "2026-01-01",
    transferId: null,
    reversalOfId: null,
    reversedAt: null,
    createdAt: new Date().toISOString(),
    ...tx,
  } as never);
}

async function seedCategory(id: string, name: string) {
  await db.categories.put({
    id,
    userId: USER,
    name,
    type: "expense",
    parentId: null,
    icon: null,
    color: null,
    sortOrder: 0,
    system: false,
    isArchived: false,
  } as never);
}

describe("local analytics", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.delete();
    await db.open();
    setActiveUserId(USER);
  });

  it("separates income and expenses and computes the savings rate", async () => {
    await seedTx({ type: "income", amountMinor: 100000, date: "2026-03-05" });
    await seedTx({ type: "expense", amountMinor: 25000, date: "2026-03-10" });

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.incomeMinor).toBe(100000);
    expect(march.expensesMinor).toBe(25000);
    expect(march.savingsMinor).toBe(75000);
    expect(march.savingsRatePercent).toBe(75);
  });

  it("returns a null savings rate when income is zero", async () => {
    await seedTx({ type: "expense", amountMinor: 5000, date: "2026-03-10" });

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.savingsRatePercent).toBeNull();
    expect(march.savingsMinor).toBe(-5000);
  });

  it("excludes transfers from income and expenses", async () => {
    await seedTx({ type: "income", amountMinor: 100000, date: "2026-03-05" });
    await seedTx({ type: "transfer", amountMinor: 40000, date: "2026-03-06" });

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.expensesMinor).toBe(0);
    expect(march.incomeMinor).toBe(100000);
  });

  it("excludes reversed transactions", async () => {
    await seedTx({ type: "expense", amountMinor: 9000, date: "2026-03-10" });
    await seedTx({ type: "expense", amountMinor: 9000, date: "2026-03-11", reversalOfId: "orig" });

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.expensesMinor).toBe(9000);
  });

  it("never sums amounts across currencies", async () => {
    await seedTx({ type: "expense", amountMinor: 10000, currency: "EGP", date: "2026-03-10" });
    await seedTx({ type: "expense", amountMinor: 999999, currency: "USD", date: "2026-03-11" });

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.expensesMinor).toBe(10000);
  });

  it("breaks spending down by category with shares", async () => {
    await seedCategory("food", "Food");
    await seedCategory("fun", "Fun");
    await seedTx({ type: "expense", amountMinor: 7500, categoryId: "food", date: "2026-03-10" });
    await seedTx({ type: "expense", amountMinor: 2500, categoryId: "fun", date: "2026-03-11" });

    const rows = await localCategoryBreakdown("EGP");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.categoryName).toBe("Food");
    expect(rows[0]!.totalMinor).toBe(7500);
    expect(rows[0]!.percentOfTotal).toBe(75);
    expect(rows[1]!.percentOfTotal).toBe(25);
  });

  it("accumulates net worth across months from the opening balance", async () => {
    await seedAccount({ openingBalanceMinor: 50000 });
    await seedTx({ type: "income", amountMinor: 30000, date: "2026-01-10" });
    await seedTx({ type: "expense", amountMinor: 10000, date: "2026-02-10" });

    const points = await localNetWorthTrend("EGP", ["2026-01", "2026-02"]);

    expect(points[0]!.totalMinor).toBe(80000);
    expect(points[1]!.totalMinor).toBe(70000);
  });

  it("compares a month against the previous one", async () => {
    await seedTx({ type: "expense", amountMinor: 10000, date: "2026-02-10" });
    await seedTx({ type: "expense", amountMinor: 15000, date: "2026-03-10" });

    const [row] = await localPeriodComparison("EGP", "2026-03");

    expect(row.currentExpensesMinor).toBe(15000);
    expect(row.previousExpensesMinor).toBe(10000);
    expect(row.expensesChangePercent).toBe(50);
  });

  it("reports a null change when the previous period had no spending", async () => {
    await seedTx({ type: "expense", amountMinor: 15000, date: "2026-03-10" });

    const [row] = await localPeriodComparison("EGP", "2026-03");

    expect(row.expensesChangePercent).toBeNull();
  });

  it("marks a budget exceeded, approaching and normal from live spending", async () => {
    await seedCategory("food", "Food");
    const base = { userId: USER, period: "2026-03", currency: "EGP", warningThresholdPercent: 80 };
    await db.budgets.bulkPut([
      { id: "b-over", categoryId: "food", amountMinor: 10000, isArchived: false, ...base },
      // 12000/15000 = 80% exactly, which is the warning threshold.
      { id: "b-near", categoryId: "food", amountMinor: 15000, isArchived: false, ...base },
      { id: "b-fine", categoryId: "food", amountMinor: 1000000, isArchived: false, ...base },
    ] as never);
    await seedTx({ type: "expense", amountMinor: 12000, categoryId: "food", date: "2026-03-10" });

    const rows = await localBudgetPerformance("2026-03");
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get("b-over")!.status).toBe("exceeded");
    expect(byId.get("b-over")!.remainingMinor).toBe(-2000);
    expect(byId.get("b-near")!.status).toBe("approaching");
    expect(byId.get("b-fine")!.status).toBe("normal");
  });

  it("computes savings goal progress and achievement", async () => {
    await db.savingsGoals.bulkPut([
      { id: "g-half", userId: USER, name: "Umrah", targetAmountMinor: 100000, currentMinor: 25000, currency: "EGP", targetDate: null, isArchived: false },
      { id: "g-done", userId: USER, name: "Emergency", targetAmountMinor: 100000, currentMinor: 120000, currency: "EGP", targetDate: null, isArchived: false },
    ] as never);

    const rows = await localSavingsGoalProgress();
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get("g-half")!.progressPercent).toBe(25);
    expect(byId.get("g-half")!.achieved).toBe(false);
    expect(byId.get("g-half")!.remainingMinor).toBe(75000);
    expect(byId.get("g-done")!.achieved).toBe(true);
  });

  it("ignores another user's records", async () => {
    await seedTx({ type: "income", amountMinor: 50000, date: "2026-03-10" });
    await db.transactions.put({
      id: "other",
      userId: "someone-else",
      accountId: "acc1",
      categoryId: null,
      type: "income",
      amountMinor: 999999,
      currency: "EGP",
      description: null,
      notes: null,
      date: "2026-03-10",
      transferId: null,
      reversalOfId: null,
      reversedAt: null,
      createdAt: new Date().toISOString(),
    } as never);

    const [march] = await localMonthlySummary("EGP", ["2026-03"]);

    expect(march.incomeMinor).toBe(50000);
  });
});
