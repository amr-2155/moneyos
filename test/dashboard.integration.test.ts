import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";
import {
  auth,
  createAccount,
  createCategory,
  createTransaction,
  createTransfer,
  signupUser,
} from "./financial.helpers.js";

const MONTH = "2026-07";

interface DashboardBody {
  month: string;
  currency: string;
  balances: { currency: string; amountMinor: number }[];
  totalBalanceMinor: number;
  monthSummary: {
    incomeMinor: number;
    expensesMinor: number;
    savingsMinor: number;
    savingsRatePercent: number | null;
  };
  spendingByCategory: { categoryId: string | null; categoryName: string; amountMinor: number }[];
  trend: { month: string; incomeMinor: number; expensesMinor: number }[];
  recentTransactions: unknown[];
  accountBalances: { accountId: string; name: string; currency: string; balanceMinor: number }[];
}

async function getDashboard(
  app: FastifyInstance,
  token: string,
  query = `month=${MONTH}`,
): Promise<DashboardBody> {
  const res = await app.inject({
    method: "GET",
    url: `/api/dashboard${query ? `?${query}` : ""}`,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json() as DashboardBody;
}

describe("dashboard API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it("computes monthly income, expenses, savings and savings rate", async () => {
    const { accessToken } = await signupUser(app, "dash@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    await createTransaction(app, accessToken, {
      type: "income",
      amount: "1000.00",
      accountId: account.id,
      categoryId: incomeCat.id,
      date: `${MONTH}-05`,
    });
    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "400.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: `${MONTH}-10`,
    });

    const body = await getDashboard(app, accessToken);

    expect(body.month).toBe(MONTH);
    expect(body.currency).toBe("EGP");
    expect(body.monthSummary.incomeMinor).toBe(100000);
    expect(body.monthSummary.expensesMinor).toBe(40000);
    expect(body.monthSummary.savingsMinor).toBe(60000);
    expect(body.monthSummary.savingsRatePercent).toBe(60);
  });

  it("returns null savings rate when income is zero", async () => {
    const { accessToken } = await signupUser(app, "zero@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food" });

    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "50.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: `${MONTH}-01`,
    });

    const body = await getDashboard(app, accessToken);
    expect(body.monthSummary.incomeMinor).toBe(0);
    expect(body.monthSummary.savingsRatePercent).toBeNull();
  });

  it("excludes transfers from income and expenses", async () => {
    const { accessToken } = await signupUser(app, "transfer@example.com");
    const a = await createAccount(app, accessToken, { name: "A", openingBalance: "1000.00" });
    const b = await createAccount(app, accessToken, { name: "B" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

    await createTransaction(app, accessToken, {
      type: "income",
      amount: "500.00",
      accountId: a.id,
      categoryId: incomeCat.id,
      date: `${MONTH}-02`,
    });
    await createTransfer(app, accessToken, {
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: "200.00",
      date: `${MONTH}-03`,
    });

    const body = await getDashboard(app, accessToken);
    expect(body.monthSummary.incomeMinor).toBe(50000);
    expect(body.monthSummary.expensesMinor).toBe(0);
    expect(body.spendingByCategory).toHaveLength(0);
    // Transfer should still show up as recent activity but never as income/expense.
    expect(body.recentTransactions.length).toBeGreaterThanOrEqual(1);
  });

  it("respects month boundaries", async () => {
    const { accessToken } = await signupUser(app, "month@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food" });

    // Last day of the previous month vs first day of the queried month.
    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "10.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: "2026-06-30",
    });
    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "25.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: `${MONTH}-01`,
    });

    const body = await getDashboard(app, accessToken);
    expect(body.monthSummary.expensesMinor).toBe(2500);

    const prev = await getDashboard(app, accessToken, "month=2026-06");
    expect(prev.monthSummary.expensesMinor).toBe(1000);
  });

  it("handles multiple currencies without silently combining them", async () => {
    const { accessToken } = await signupUser(app, "multi@example.com");
    const egp = await createAccount(app, accessToken, { name: "EGP", currency: "EGP" });
    const usd = await createAccount(app, accessToken, { name: "USD", currency: "USD" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

    await createTransaction(app, accessToken, {
      type: "income",
      amount: "100.00",
      accountId: egp.id,
      categoryId: incomeCat.id,
      date: `${MONTH}-01`,
    });
    await createTransaction(app, accessToken, {
      type: "income",
      amount: "50.00",
      accountId: usd.id,
      categoryId: incomeCat.id,
      date: `${MONTH}-01`,
    });

    const egpView = await getDashboard(app, accessToken);
    expect(egpView.currency).toBe("EGP");
    expect(egpView.monthSummary.incomeMinor).toBe(10000);
    expect(egpView.balances.find((b) => b.currency === "EGP")?.amountMinor).toBe(10000);
    expect(egpView.balances.find((b) => b.currency === "USD")?.amountMinor).toBe(5000);

    const usdView = await getDashboard(app, accessToken, `month=${MONTH}&currency=USD`);
    expect(usdView.currency).toBe("USD");
    expect(usdView.monthSummary.incomeMinor).toBe(5000);
  });

  it("reports account balances and total balance by currency", async () => {
    const { accessToken } = await signupUser(app, "bal@example.com");
    await createAccount(app, accessToken, { name: "Cash", openingBalance: "250.00" });
    await createAccount(app, accessToken, { name: "Bank", openingBalance: "750.50" });

    const body = await getDashboard(app, accessToken);
    expect(body.totalBalanceMinor).toBe(100050);
    expect(body.balances).toHaveLength(1);
    expect(body.balances[0]!.amountMinor).toBe(100050);
    expect(body.accountBalances).toHaveLength(2);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard" });
    expect(res.statusCode).toBe(401);
  });
});
