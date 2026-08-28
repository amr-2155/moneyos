import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addMonths, currentMonthStr } from "../src/lib/dates.js";
import { createTestApp, type TestContext } from "./helpers.js";
import {
  auth,
  createAccount,
  createCategory,
  createTransaction,
  signupUser,
} from "./financial.helpers.js";

interface SavingsGoalView {
  id: string;
  name: string;
  targetAmount: string;
  targetAmountMinor: number;
  currentAmount: string;
  currentMinor: number;
  currency: string;
  targetDate: string | null;
  description: string | null;
  progressPercent: number;
  achieved: boolean;
  remainingAmount: string;
  remainingMinor: number;
  isArchived: boolean;
  estimates: {
    requiredMonthly: string | null;
    requiredMonthlyMinor: number | null;
    completionMonth: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

async function createGoal(
  app: FastifyInstance,
  token: string,
  input: {
    name: string;
    targetAmount: string;
    currency?: string;
    targetDate?: string | null;
    description?: string;
    currentAmount?: string;
  },
): Promise<SavingsGoalView> {
  const res = await app.inject({
    method: "POST",
    url: "/api/savings-goals",
    headers: auth(token),
    payload: {
      name: input.name,
      targetAmount: input.targetAmount,
      currency: input.currency ?? "EGP",
      ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.currentAmount !== undefined ? { currentAmount: input.currentAmount } : {}),
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as SavingsGoalView;
}

async function addContribution(
  app: FastifyInstance,
  token: string,
  goalId: string,
  input: { amount: string; note?: string },
): Promise<SavingsGoalView> {
  const res = await app.inject({
    method: "POST",
    url: `/api/savings-goals/${goalId}/contributions`,
    headers: auth(token),
    payload: { amount: input.amount, ...(input.note !== undefined ? { note: input.note } : {}) },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as SavingsGoalView;
}

describe("savings goals API", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a goal and computes progress, remaining and estimates", async () => {
    const { accessToken } = await signupUser(app, "s@example.com");

    const goal = await createGoal(app, accessToken, {
      name: "New car",
      targetAmount: "10000.00",
      targetDate: `${addMonths(currentMonthStr(), 10)}-15`,
      description: "Emergency cushion",
    });

    expect(goal.targetAmountMinor).toBe(1_000_000);
    expect(goal.currentMinor).toBe(0);
    expect(goal.progressPercent).toBe(0);
    expect(goal.achieved).toBe(false);
    expect(goal.remainingMinor).toBe(1_000_000);
    expect(goal.remainingAmount).toBe("10000.00");
    expect(goal.estimates.requiredMonthlyMinor).toBe(100000);
    expect(goal.estimates.requiredMonthly).toBe("1000.00");
  });

  it("accepts a starting balance and records it as a contribution", async () => {
    const { accessToken } = await signupUser(app, "s-start@example.com");
    const goal = await createGoal(app, accessToken, {
      name: "Trip",
      targetAmount: "5000.00",
      currentAmount: "1000.00",
    });

    expect(goal.currentMinor).toBe(100000);
    expect(goal.progressPercent).toBe(20);
    expect(goal.remainingMinor).toBe(400000);

    const contributions = await app.inject({
      method: "GET",
      url: `/api/savings-goals/${goal.id}/contributions`,
      headers: auth(accessToken),
    });
    expect(contributions.statusCode).toBe(200);
    const rows = contributions.json() as { amountMinor: number; note: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountMinor).toBe(100000);
    expect(rows[0]!.note).toBe("Initial balance");
  });

  it("accumulates contributions and marks the goal achieved", async () => {
    const { accessToken } = await signupUser(app, "s-acc@example.com");
    const goal = await createGoal(app, accessToken, { name: "Fund", targetAmount: "3000.00" });

    const afterOne = await addContribution(app, accessToken, goal.id, {
      amount: "2000.00",
      note: "Bonus",
    });
    expect(afterOne.currentMinor).toBe(200000);
    expect(afterOne.progressPercent).toBe(67);
    expect(afterOne.achieved).toBe(false);

    const afterTwo = await addContribution(app, accessToken, goal.id, { amount: "1000.00" });
    expect(afterTwo.currentMinor).toBe(300000);
    expect(afterTwo.progressPercent).toBe(100);
    expect(afterTwo.achieved).toBe(true);
    expect(afterTwo.remainingMinor).toBe(0);
    expect(afterTwo.estimates.completionMonth).toBeNull();
  });

  it("requires a positive contribution and rejects archived goals", async () => {
    const { accessToken } = await signupUser(app, "s-zero@example.com");
    const goal = await createGoal(app, accessToken, { name: "Fund", targetAmount: "1000.00" });

    const zero = await app.inject({
      method: "POST",
      url: `/api/savings-goals/${goal.id}/contributions`,
      headers: auth(accessToken),
      payload: { amount: "0.00" },
    });
    expect(zero.statusCode).toBe(400);

    const archiveRes = await app.inject({
      method: "POST",
      url: `/api/savings-goals/${goal.id}/archive`,
      headers: auth(accessToken),
    });
    expect(archiveRes.statusCode).toBe(200);

    const afterArchive = await app.inject({
      method: "POST",
      url: `/api/savings-goals/${goal.id}/contributions`,
      headers: auth(accessToken),
      payload: { amount: "50.00" },
    });
    expect(afterArchive.statusCode).toBe(400);
  });

  it("projects a completion month from recent savings in the goal currency", async () => {
    const { accessToken } = await signupUser(app, "s-est@example.com");
    const account = await createAccount(app, accessToken, { name: "Main" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    await createTransaction(app, accessToken, {
      type: "income",
      amount: "12000.00",
      accountId: account.id,
      categoryId: incomeCat.id,
      date: `${currentMonthStr()}-05`,
    });

    const goal = await createGoal(app, accessToken, { name: "Fund", targetAmount: "10000.00" });

    // Avg monthly savings over last 6 months = 2000.00 EGP -> ceil(10000/2000) = 5 months.
    expect(goal.estimates.completionMonth).toBe(addMonths(currentMonthStr(), 5));
  });

  it("isolates goals and contributions between users", async () => {
    const { accessToken: aToken } = await signupUser(app, "s-userA@example.com");
    const { accessToken: bToken } = await signupUser(app, "s-userB@example.com");

    const goalA = await createGoal(app, aToken, { name: "A fund", targetAmount: "2000.00" });

    const otherRes = await app.inject({
      method: "GET",
      url: `/api/savings-goals/${goalA.id}`,
      headers: auth(bToken),
    });
    expect(otherRes.statusCode).toBe(404);

    const otherContrib = await app.inject({
      method: "POST",
      url: `/api/savings-goals/${goalA.id}/contributions`,
      headers: auth(bToken),
      payload: { amount: "100.00" },
    });
    expect(otherContrib.statusCode).toBe(404);

    const bGoal = await createGoal(app, bToken, { name: "B fund", targetAmount: "5000.00" });
    expect(bGoal.currentMinor).toBe(0);
  });
});
