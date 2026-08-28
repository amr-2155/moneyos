import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestContext } from "./helpers.js";
import { auth, createAccount, createCategory, createTransaction, signupUser } from "./financial.helpers.js";

const TODAY = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
})();
const MONTH = TODAY.slice(0, 7);

interface TransactionView {
  id: string;
  amountMinor: number;
  reversalOfId: string | null;
  reversedAt: string | null;
  description: string | null;
}

async function getTransaction(app: FastifyInstance, token: string, id: string): Promise<TransactionView> {
  const res = await app.inject({ method: "GET", url: `/api/transactions/${id}`, headers: auth(token) });
  expect(res.statusCode).toBe(200);
  return res.json() as TransactionView;
}

async function getDashboard(
  app: FastifyInstance,
  token: string,
): Promise<{ monthSummary: { incomeMinor: number; expensesMinor: number; savingsMinor: number } }> {
  const res = await app.inject({ method: "GET", url: `/api/dashboard?month=${MONTH}`, headers: auth(token) });
  expect(res.statusCode).toBe(200);
  return res.json() as never;
}

describe("transactions API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it("reverses an expense and offsets it in the dashboard", async () => {
    const { accessToken } = await signupUser(app, "reverse@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    await createTransaction(app, accessToken, {
      type: "income",
      amount: "1000.00",
      accountId: account.id,
      categoryId: incomeCat.id,
      date: TODAY,
    });
    const expense = await createTransaction(app, accessToken, {
      type: "expense",
      amount: "400.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: TODAY,
    });

    const before = await getDashboard(app, accessToken);
    expect(before.monthSummary.incomeMinor).toBe(100000);
    expect(before.monthSummary.expensesMinor).toBe(40000);

    const res = await app.inject({
      method: "POST",
      url: `/api/transactions/${expense.id}/reverse`,
      headers: auth(accessToken),
    });
    expect(res.statusCode).toBe(201);
    const reversal = res.json() as TransactionView;
    expect(reversal.reversalOfId).toBe(expense.id);
    expect(reversal.amountMinor).toBe(40000);

    const original = await getTransaction(app, accessToken, expense.id);
    expect(original.reversedAt).not.toBeNull();

    const after = await getDashboard(app, accessToken);
    expect(after.monthSummary.incomeMinor).toBe(100000);
    expect(after.monthSummary.expensesMinor).toBe(0);
    expect(after.monthSummary.savingsMinor).toBe(100000);
  });

  it("rejects reversing an already-reversed transaction", async () => {
    const { accessToken } = await signupUser(app, "double@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });
    const expense = await createTransaction(app, accessToken, {
      type: "expense",
      amount: "50.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: TODAY,
    });

    await app.inject({ method: "POST", url: `/api/transactions/${expense.id}/reverse`, headers: auth(accessToken) });
    const again = await app.inject({
      method: "POST",
      url: `/api/transactions/${expense.id}/reverse`,
      headers: auth(accessToken),
    });
    expect(again.statusCode).toBe(409);
  });

  it("requires authentication to reverse", async () => {
    const res = await app.inject({ method: "POST", url: "/api/transactions/some-id/reverse" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for a foreign transaction", async () => {
    const owner = await signupUser(app, "owner@example.com");
    const stranger = await signupUser(app, "stranger@example.com");
    const account = await createAccount(app, owner.accessToken, { name: "Main" });
    const expenseCat = await createCategory(app, owner.accessToken, { name: "Food", type: "expense" });
    const expense = await createTransaction(app, owner.accessToken, {
      type: "expense",
      amount: "10.00",
      accountId: account.id,
      categoryId: expenseCat.id,
      date: TODAY,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/transactions/${expense.id}/reverse`,
      headers: auth(stranger.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

