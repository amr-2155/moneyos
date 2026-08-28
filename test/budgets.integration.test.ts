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

const PERIOD = "2026-07";

interface BudgetView {
  id: string;
  categoryId: string;
  categoryName: string;
  period: string;
  amount: string;
  amountMinor: number;
  currency: string;
  spent: string;
  spentMinor: number;
  remaining: string;
  remainingMinor: number;
  percentUsed: number;
  status: "normal" | "approaching" | "exceeded";
  warningThresholdPercent: number;
  isArchived: boolean;
}

async function createBudget(
  app: FastifyInstance,
  token: string,
  input: {
    categoryId: string;
    amount: string;
    currency?: string;
    period?: string;
    warningThresholdPercent?: number;
  },
): Promise<BudgetView> {
  const res = await app.inject({
    method: "POST",
    url: "/api/budgets",
    headers: auth(token),
    payload: {
      categoryId: input.categoryId,
      amount: input.amount,
      currency: input.currency ?? "EGP",
      period: input.period ?? PERIOD,
      ...(input.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: input.warningThresholdPercent }
        : {}),
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as BudgetView;
}

async function getBudgets(app: FastifyInstance, token: string, query = ""): Promise<BudgetView[]> {
  const res = await app.inject({
    method: "GET",
    url: `/api/budgets${query ? `?${query}` : ""}`,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json() as BudgetView[];
}

describe("budgets API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedSpending(token: string, amount: string) {
    const account = await createAccount(app, token, { name: "Main" });
    const category = await createCategory(app, token, { name: "Food" });
    const tx = await createTransaction(app, token, {
      type: "expense",
      amount,
      accountId: account.id,
      categoryId: category.id,
      date: `${PERIOD}-10`,
    });
    return { account, category, tx };
  }

  it("computes spent, remaining and percentage used", async () => {
    const { accessToken } = await signupUser(app, "b@example.com");
    const { category } = await seedSpending(accessToken, "2200.00");

    const budget = await createBudget(app, accessToken, { categoryId: category.id, amount: "3000.00" });

    expect(budget.spentMinor).toBe(220000);
    expect(budget.spent).toBe("2200.00");
    expect(budget.remainingMinor).toBe(80000);
    expect(budget.remaining).toBe("800.00");
    expect(budget.percentUsed).toBe(73);
    expect(budget.status).toBe("normal");
  });

  it("marks a budget as approaching the limit at the warning threshold", async () => {
    const { accessToken } = await signupUser(app, "b-approach@example.com");
    const { category } = await seedSpending(accessToken, "2200.00");

    const budget = await createBudget(app, accessToken, {
      categoryId: category.id,
      amount: "2500.00",
      warningThresholdPercent: 80,
    });

    expect(budget.percentUsed).toBe(88);
    expect(budget.status).toBe("approaching");
  });

  it("marks a budget as exceeded when spending passes the limit", async () => {
    const { accessToken } = await signupUser(app, "b-over@example.com");
    const { category } = await seedSpending(accessToken, "2200.00");

    const budget = await createBudget(app, accessToken, {
      categoryId: category.id,
      amount: "2000.00",
    });

    expect(budget.percentUsed).toBe(110);
    expect(budget.status).toBe("exceeded");
  });

  it("only counts expenses (not income or transfers) for spending", async () => {
    const { accessToken } = await signupUser(app, "b-net@example.com");
    const a = await createAccount(app, accessToken, { name: "A", openingBalance: "5000.00" });
    const b = await createAccount(app, accessToken, { name: "B" });
    const category = await createCategory(app, accessToken, { name: "Food" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

    await createTransaction(app, accessToken, {
      type: "income",
      amount: "1000.00",
      accountId: a.id,
      categoryId: incomeCat.id,
      date: `${PERIOD}-01`,
    });
    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "150.00",
      accountId: a.id,
      categoryId: category.id,
      date: `${PERIOD}-02`,
    });
    await createTransfer(app, accessToken, {
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: "300.00",
      date: `${PERIOD}-03`,
    });

    const budget = await createBudget(app, accessToken, { categoryId: category.id, amount: "500.00" });
    expect(budget.spentMinor).toBe(15000);
    expect(budget.remainingMinor).toBe(35000);
  });

  it("isolates budget spending by currency", async () => {
    const { accessToken } = await signupUser(app, "b-cur@example.com");
    const egp = await createAccount(app, accessToken, { name: "EGP", currency: "EGP" });
    const usd = await createAccount(app, accessToken, { name: "USD", currency: "USD" });
    const category = await createCategory(app, accessToken, { name: "Food" });

    await createTransaction(app, accessToken, {
      type: "expense",
      amount: "100.00",
      accountId: usd.id,
      categoryId: category.id,
      date: `${PERIOD}-01`,
    });

    const budget = await createBudget(app, accessToken, { categoryId: category.id, amount: "500.00" });
    expect(budget.currency).toBe("EGP");
    expect(budget.spentMinor).toBe(0);
    void egp;
  });

  it("rejects a duplicate budget for the same category and period", async () => {
    const { accessToken } = await signupUser(app, "b-dup@example.com");
    const { category } = await seedSpending(accessToken, "10.00");

    await createBudget(app, accessToken, { categoryId: category.id, amount: "100.00" });
    const res = await app.inject({
      method: "POST",
      url: "/api/budgets",
      headers: auth(accessToken),
      payload: { categoryId: category.id, amount: "200.00", currency: "EGP", period: PERIOD },
    });
    expect(res.statusCode).toBe(409);
  });

  it("supports updating and archiving a budget", async () => {
    const { accessToken } = await signupUser(app, "b-update@example.com");
    const { category } = await seedSpending(accessToken, "100.00");
    const budget = await createBudget(app, accessToken, { categoryId: category.id, amount: "200.00" });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/budgets/${budget.id}`,
      headers: auth(accessToken),
      payload: { amount: "300.00" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect((patchRes.json() as BudgetView).amountMinor).toBe(30000);

    const archiveRes = await app.inject({
      method: "POST",
      url: `/api/budgets/${budget.id}/archive`,
      headers: auth(accessToken),
    });
    expect(archiveRes.statusCode).toBe(200);
    expect((archiveRes.json() as BudgetView).isArchived).toBe(true);

    const list = await getBudgets(app, accessToken);
    expect(list).toHaveLength(0);
    const withArchived = await getBudgets(app, accessToken, "includeArchived=true");
    expect(withArchived).toHaveLength(1);
  });

  it("isolates budgets and spending between users", async () => {
    const { accessToken: aToken } = await signupUser(app, "b-userA@example.com");
    const { accessToken: bToken } = await signupUser(app, "b-userB@example.com");

    const aSpending = await seedSpending(aToken, "500.00");
    const budgetA = await createBudget(app, aToken, {
      categoryId: aSpending.category.id,
      amount: "1000.00",
    });

    // User B cannot see or touch user A's budget.
    const otherRes = await app.inject({
      method: "GET",
      url: `/api/budgets/${budgetA.id}`,
      headers: auth(bToken),
    });
    expect(otherRes.statusCode).toBe(404);

    // User B has their own category/budget and is unaffected by user A's spending.
    const bCategory = await createCategory(app, bToken, { name: "Food" });
    const budgetB = await createBudget(app, bToken, { categoryId: bCategory.id, amount: "1000.00" });
    expect(budgetB.spentMinor).toBe(0);
  });
});
