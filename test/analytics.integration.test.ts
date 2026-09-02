import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";
import {
  auth,
  createAccount,
  createBudget,
  createCategory,
  createSavingsGoal,
  createTransaction,
  signupUser,
} from "./financial.helpers.js";

interface MonthlySummary {
  month: string;
  currency: string;
  incomeMinor: number;
  expensesMinor: number;
  savingsMinor: number;
  savingsRatePercent: number | null;
}

interface CategoryAggregate {
  categoryId: string | null;
  categoryName: string;
  currency: string;
  totalMinor: number;
  percentOfTotal: number;
}

interface PeriodComparison {
  from: string;
  to: string;
  currency: string;
  currentIncomeMinor: number;
  currentExpensesMinor: number;
  previousIncomeMinor: number;
  previousExpensesMinor: number;
  incomeChangePercent: number | null;
  expensesChangePercent: number | null;
}

interface NetWorthPoint {
  month: string;
  currency: string;
  totalMinor: number;
}

interface AnalyticsOverview {
  query: { from?: string; to?: string; currency?: string };
  months: MonthlySummary[];
  spendingByCategory: CategoryAggregate[];
  netWorthTrend: NetWorthPoint[];
}

async function getJSON(app: FastifyInstance, token: string, url: string): Promise<unknown> {
  const res = await app.inject({ method: "GET", url, headers: auth(token) });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function seedBasicData(
  app: FastifyInstance,
  token: string,
): Promise<{
  account: { id: string };
  incomeCat: { id: string };
  foodCat: { id: string };
  rentCat: { id: string };
}> {
  const account = await createAccount(app, token, { name: "Main", openingBalance: "500.00" });
  const incomeCat = await createCategory(app, token, { name: "Salary", type: "income" });
  const foodCat = await createCategory(app, token, { name: "Food", type: "expense" });
  const rentCat = await createCategory(app, token, { name: "Rent", type: "expense" });

  // July income
  await createTransaction(app, token, {
    type: "income",
    amount: "2000.00",
    accountId: account.id,
    categoryId: incomeCat.id,
    date: "2026-07-15",
  });
  // July expenses
  await createTransaction(app, token, {
    type: "expense",
    amount: "600.00",
    accountId: account.id,
    categoryId: foodCat.id,
    date: "2026-07-10",
  });
  await createTransaction(app, token, {
    type: "expense",
    amount: "1000.00",
    accountId: account.id,
    categoryId: rentCat.id,
    date: "2026-07-20",
  });
  // August income
  await createTransaction(app, token, {
    type: "income",
    amount: "3000.00",
    accountId: account.id,
    categoryId: incomeCat.id,
    date: "2026-08-15",
  });
  // August expenses
  await createTransaction(app, token, {
    type: "expense",
    amount: "800.00",
    accountId: account.id,
    categoryId: foodCat.id,
    date: "2026-08-10",
  });
  await createTransaction(app, token, {
    type: "expense",
    amount: "1000.00",
    accountId: account.id,
    categoryId: rentCat.id,
    date: "2026-08-20",
  });

  return { account, incomeCat, foodCat, rentCat };
}

describe("analytics API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /analytics/monthly-summary", () => {
    it("returns monthly income, expenses, savings and savings rate", async () => {
      const { accessToken } = await signupUser(app, "monthly@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(app, accessToken, "/api/analytics/monthly-summary?from=2026-07&to=2026-08")) as MonthlySummary[];

      const aug = body.find((m) => m.month === "2026-08" && m.currency === "EGP");
      expect(aug).toBeDefined();
      expect(aug!.incomeMinor).toBe(300000);
      expect(aug!.expensesMinor).toBe(-180000);
      expect(aug!.savingsMinor).toBe(120000);
      expect(aug!.savingsRatePercent).toBe(40);
    });

    it("fills gaps for months with no transactions (all zeroes)", async () => {
      const { accessToken } = await signupUser(app, "gap@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/monthly-summary?from=2026-06&to=2026-08",
      )) as MonthlySummary[];

      const june = body.find((m) => m.month === "2026-06" && m.currency === "EGP");
      expect(june).toBeDefined();
      expect(june!.incomeMinor).toBe(0);
      expect(june!.expensesMinor).toBe(0);
      expect(june!.savingsMinor).toBe(0);
      expect(june!.savingsRatePercent).toBeNull();
    });

    it("returns null savings rate when income is zero for a month", async () => {
      const { accessToken } = await signupUser(app, "zeroincome@example.com");
      const account = await createAccount(app, accessToken, { name: "Main" });
      const foodCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "50.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-01",
      });

      const body = (await getJSON(app, accessToken, "/api/analytics/monthly-summary?from=2026-08&to=2026-08")) as MonthlySummary[];
      expect(body[0]!.incomeMinor).toBe(0);
      expect(body[0]!.savingsRatePercent).toBeNull();
    });

    it("filters by currency without combining currencies", async () => {
      const { accessToken } = await signupUser(app, "cur@example.com");
      await seedBasicData(app, accessToken);
      const usdAccount = await createAccount(app, accessToken, {
        name: "USD",
        currency: "USD",
        openingBalance: "100.00",
      });
      const incomeCat = await createCategory(app, accessToken, { name: "Side", type: "income" });
      await createTransaction(app, accessToken, {
        type: "income",
        amount: "500.00",
        accountId: usdAccount.id,
        categoryId: incomeCat.id,
        date: "2026-08-15",
      });

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/monthly-summary?from=2026-08&to=2026-08&currency=USD",
      )) as MonthlySummary[];

      const entries = body.filter((m) => m.month === "2026-08");
      // Only USD currency should be present.
      expect(entries.every((m) => m.currency === "USD")).toBe(true);
      expect(entries[0]!.incomeMinor).toBe(50000);
    });

    it("requires authentication", async () => {
      const res = await app.inject({ method: "GET", url: "/api/analytics/monthly-summary" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /analytics/category-breakdown", () => {
    it("aggregates expenses by category with percentages", async () => {
      const { accessToken } = await signupUser(app, "cat@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/category-breakdown?from=2026-07&to=2026-08",
      )) as CategoryAggregate[];

      expect(body.some((c) => c.categoryName === "Food")).toBe(true);
      expect(body.some((c) => c.categoryName === "Rent")).toBe(true);

      const food = body.find((c) => c.categoryName === "Food");
      expect(food).toBeDefined();
      expect(food!.totalMinor).toBe(140000); // 600 + 800

      // Percentages should sum to ~100.
      const totalPercent = body.reduce((sum, c) => sum + c.percentOfTotal, 0);
      expect(totalPercent).toBeCloseTo(100, 1);
    });

    it("sorts categories by amount descending and respects limit", async () => {
      const { accessToken } = await signupUser(app, "catlimit@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/category-breakdown?from=2026-07&to=2026-08&limit=1",
      )) as CategoryAggregate[];

      expect(body).toHaveLength(1);
      // Rent (1000+1000=2000) should be the top category.
      expect(body[0]!.categoryName).toBe("Rent");
      expect(body[0]!.totalMinor).toBe(200000);
    });
  });

  describe("GET /analytics/income-expense-trend", () => {
    it("returns trend over the last 6 months by default", async () => {
      vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
      const { accessToken } = await signupUser(app, "trend@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(app, accessToken, "/api/analytics/income-expense-trend")) as MonthlySummary[];

      // Default is 6 months ending at current month (2026-08).
      const months = body.map((m) => m.month);
      expect(months).toContain("2026-03");
      expect(months).toContain("2026-08");
      expect(months).toHaveLength(6);
    });

    it("respects a custom month count", async () => {
      vi.useRealTimers();
      const { accessToken } = await signupUser(app, "trend2@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/income-expense-trend?from=2026-07&to=2026-08",
      )) as MonthlySummary[];

      const months = body.map((m) => m.month);
      expect(months).toContain("2026-07");
      expect(months).toContain("2026-08");
      expect(months).toHaveLength(2);
    });
  });

  describe("GET /analytics/period-comparison", () => {
    it("compares current vs previous period with percentage change", async () => {
      const { accessToken } = await signupUser(app, "compare@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/period-comparison?month=2026-08&months=1",
      )) as PeriodComparison[];

      const entry = body.find((c) => c.currency === "EGP");
      expect(entry).toBeDefined();

      // Current period: Aug (income=3000, expense=1800)
      expect(entry!.currentIncomeMinor).toBe(300000);
      expect(entry!.currentExpensesMinor).toBe(-180000);

      // Previous period: Jul (income=2000, expense=1600)
      expect(entry!.previousIncomeMinor).toBe(200000);
      expect(entry!.previousExpensesMinor).toBe(-160000);

      // Income change: (3000-2000)/2000 = 50
      expect(entry!.incomeChangePercent).toBe(50);
      // Expense change: (1800-1600)/1600 = -12.5 → rounded to -13 (negative = increase in spending)
      expect(entry!.expensesChangePercent).toBe(-13);
    });

    it("returns null percentage change when previous period is zero", async () => {
      const { accessToken } = await signupUser(app, "compare2@example.com");
      await seedBasicData(app, accessToken);

      // months=3 from 2026-08: current=Jun-Aug (has income), previous=Mar-May (no income)
      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/period-comparison?month=2026-08&months=3",
      )) as PeriodComparison[];

      const entry = body.find((c) => c.currency === "EGP");
      expect(entry).toBeDefined();
      // Previous period (Mar-May) has no income → percentage change is null.
      expect(entry!.incomeChangePercent).toBeNull();
    });
  });

  describe("GET /analytics/net-worth-trend", () => {
    it("computes cumulative net worth including opening balances", async () => {
      const { accessToken } = await signupUser(app, "networth@example.com");
      const account = await createAccount(app, accessToken, {
        name: "Main",
        openingBalance: "500.00",
      });
      const foodCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });
      const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

      await createTransaction(app, accessToken, {
        type: "income",
        amount: "100.00",
        accountId: account.id,
        categoryId: incomeCat.id,
        date: "2026-08-15",
      });
      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "50.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-20",
      });

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/net-worth-trend?from=2026-07&to=2026-08",
      )) as NetWorthPoint[];

      // July has no transactions — net worth = opening balance only.
      const july = body.find((p) => p.month === "2026-07");
      expect(july).toBeDefined();
      expect(july!.totalMinor).toBe(50000);

      // August: 500 + 100 - 50 = 550
      const august = body.find((p) => p.month === "2026-08");
      expect(august).toBeDefined();
      expect(august!.totalMinor).toBe(55000);
    });

    it("tracks multi-month cumulative flow", async () => {
      const { accessToken } = await signupUser(app, "networth2@example.com");
      const account = await createAccount(app, accessToken, {
        name: "Main",
        openingBalance: "1000.00",
      });
      const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
      const foodCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

      await createTransaction(app, accessToken, {
        type: "income",
        amount: "500.00",
        accountId: account.id,
        categoryId: incomeCat.id,
        date: "2026-07-15",
      });
      await createTransaction(app, accessToken, {
        type: "income",
        amount: "300.00",
        accountId: account.id,
        categoryId: incomeCat.id,
        date: "2026-08-15",
      });
      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "200.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-20",
      });

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/net-worth-trend?from=2026-07&to=2026-08",
      )) as NetWorthPoint[];

      const july = body.find((p) => p.month === "2026-07");
      expect(july!.totalMinor).toBe(150000); // 1000 + 500

      const august = body.find((p) => p.month === "2026-08");
      expect(august!.totalMinor).toBe(160000); // 1000 + 500 + 300 - 200
    });
  });

  describe("GET /analytics/overview", () => {
    it("returns the combined analytics overview", async () => {
      const { accessToken } = await signupUser(app, "overview@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/overview?from=2026-07&to=2026-08",
      )) as AnalyticsOverview;

      expect(body.query).toEqual({ from: "2026-07", to: "2026-08", currency: undefined });
      expect(body.months).toHaveLength(2); // 2 months × 1 currency (EGP)
      expect(body.spendingByCategory.length).toBeGreaterThan(0);
      expect(body.netWorthTrend.length).toBe(2);
    });

    it("respects currency filter in overview", async () => {
      const { accessToken } = await signupUser(app, "overview2@example.com");
      await seedBasicData(app, accessToken);

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/overview?from=2026-07&to=2026-08&currency=USD",
      )) as AnalyticsOverview;

      expect(body.months.every((m) => m.currency === "USD")).toBe(true);
      expect(body.netWorthTrend.every((n) => n.currency === "USD")).toBe(true);
    });
  });

  describe("Budget & savings-goal analytics", () => {
    it("GET /analytics/budget-performance reports spent and status", async () => {
      const { accessToken } = await signupUser(app, "budget@example.com");
      const account = await createAccount(app, accessToken, { name: "Main" });
      const foodCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });
      const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

      await createTransaction(app, accessToken, {
        type: "income",
        amount: "1000.00",
        accountId: account.id,
        categoryId: incomeCat.id,
        date: "2026-08-15",
      });
      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "750.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-10",
      });

      const budget = await createBudget(app, accessToken, {
        categoryId: foodCat.id,
        amount: "1000.00",
        currency: "EGP",
        period: "2026-08",
      });

      const body = (await getJSON(app, accessToken, "/api/analytics/budget-performance")) as Array<{
        id: string;
        spentMinor: number;
        amountMinor: number;
        percentUsed: number;
        status: string;
      }>;

      const found = body.find((b) => b.id === budget.id);
      expect(found).toBeDefined();
      expect(found!.spentMinor).toBe(75000);
      expect(found!.amountMinor).toBe(100000);
      expect(found!.percentUsed).toBe(75);
      expect(found!.status).toBe("normal");
    });

    it("GET /analytics/budget-performance reports exceeded status", async () => {
      const { accessToken } = await signupUser(app, "budget2@example.com");
      const account = await createAccount(app, accessToken, { name: "Main" });
      const foodCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });
      const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

      await createTransaction(app, accessToken, {
        type: "income",
        amount: "2000.00",
        accountId: account.id,
        categoryId: incomeCat.id,
        date: "2026-08-15",
      });
      // Total food spending 1200 against a 1000 budget
      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "500.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-10",
      });
      await createTransaction(app, accessToken, {
        type: "expense",
        amount: "700.00",
        accountId: account.id,
        categoryId: foodCat.id,
        date: "2026-08-20",
      });

      await createBudget(app, accessToken, {
        categoryId: foodCat.id,
        amount: "1000.00",
        currency: "EGP",
        period: "2026-08",
      });

      const body = (await getJSON(app, accessToken, "/api/analytics/budget-performance")) as Array<{
        spentMinor: number;
        status: string;
      }>;

      expect(body[0]!.spentMinor).toBe(120000);
      expect(body[0]!.status).toBe("exceeded");
    });

    it("GET /analytics/savings-goal-progress reports progress", async () => {
      const { accessToken } = await signupUser(app, "savings@example.com");

      const goal = await createSavingsGoal(app, accessToken, {
        name: "Vacation",
        targetAmount: "1000.00",
        currency: "USD",
        currentAmount: "200.00",
      });

      const body = (await getJSON(
        app,
        accessToken,
        "/api/analytics/savings-goal-progress",
      )) as Array<{ id: string; currentMinor: number; targetAmountMinor: number; progressPercent: number }>;

      const found = body.find((g) => g.id === goal.id);
      expect(found).toBeDefined();
      expect(found!.currentMinor).toBe(20000); // 200.00 in USD minor units
      expect(found!.targetAmountMinor).toBe(100000);
      expect(found!.progressPercent).toBe(20);
    });

    it("GET /analytics/budget-performance requires authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/analytics/budget-performance",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Data isolation between users", () => {
    it("does not leak analytics across users", async () => {
      const { accessToken: userA } = await signupUser(app, "userA@example.com");
      const { accessToken: userB } = await signupUser(app, "userB@example.com");

      await createAccount(app, userA, { name: "Main" });
      const accountB = await createAccount(app, userB, { name: "Main" });
      const incomeCatB = await createCategory(app, userB, { name: "Salary", type: "income" });

      await createTransaction(app, userB, {
        type: "income",
        amount: "5000.00",
        accountId: accountB.id,
        categoryId: incomeCatB.id,
        date: "2026-08-15",
      });

      const bodyA = (await getJSON(app, userA, "/api/analytics/monthly-summary?from=2026-08&to=2026-08")) as MonthlySummary[];
      const augA = bodyA.find((m) => m.month === "2026-08" && m.currency === "EGP");
      expect(augA!.incomeMinor).toBe(0);
      expect(augA!.expensesMinor).toBe(0);
    });
  });
});
