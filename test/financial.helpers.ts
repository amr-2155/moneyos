import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export async function signupUser(
  app: FastifyInstance,
  email: string,
  password = "correct-horse-battery",
): Promise<{ accessToken: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: { email, password, name: email.split("@")[0] },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as {
    user: { id: string };
    tokens: Tokens;
  };
  return { accessToken: body.tokens.accessToken, userId: body.user.id };
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export interface AccountView {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  balanceMinor: number;
}

export async function createAccount(
  app: FastifyInstance,
  token: string,
  input: { name: string; type?: string; currency?: string; openingBalance?: string },
): Promise<AccountView> {
  const res = await app.inject({
    method: "POST",
    url: "/api/accounts",
    headers: auth(token),
    payload: {
      name: input.name,
      type: input.type ?? "bank",
      currency: input.currency ?? "EGP",
      openingBalance: input.openingBalance ?? "0",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as AccountView;
}

export interface CategoryView {
  id: string;
  name: string;
  type: string;
}

export async function createCategory(
  app: FastifyInstance,
  token: string,
  input: { name: string; type?: string },
): Promise<CategoryView> {
  const res = await app.inject({
    method: "POST",
    url: "/api/categories",
    headers: auth(token),
    payload: { name: input.name, type: input.type ?? "expense" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as CategoryView;
}

export async function createTransaction(
  app: FastifyInstance,
  token: string,
  input: {
    type: "income" | "expense";
    amount: string;
    accountId: string;
    categoryId: string;
    date: string;
  },
): Promise<{ id: string; amountMinor: number }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/transactions",
    headers: auth(token),
    payload: input,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; amountMinor: number };
}

export async function createTransfer(
  app: FastifyInstance,
  token: string,
  input: { fromAccountId: string; toAccountId: string; amount: string; date: string },
): Promise<{ id: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/transfers",
    headers: auth(token),
    payload: input,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

export async function createBudget(
  app: FastifyInstance,
  token: string,
  input: {
    categoryId: string;
    amount: string;
    currency: string;
    period: string;
    warningThresholdPercent?: number;
  },
): Promise<{ id: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/budgets",
    headers: auth(token),
    payload: input,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

export async function createSavingsGoal(
  app: FastifyInstance,
  token: string,
  input: { name: string; targetAmount: string; currency: string; targetDate?: string; currentAmount?: string },
): Promise<{ id: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/savings-goals",
    headers: auth(token),
    payload: input,
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}
