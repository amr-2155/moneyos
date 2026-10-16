import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { setActiveUserId } from "./session";
import { isEmptyForDemo, loadDemoData } from "./demoData";

const USER = "demo-user";
const CURRENCY = "EGP";

async function countFor(userId: string) {
  const [accounts, categories, transactions, budgets, goals, contributions] = await Promise.all([
    db.accounts.where("userId").equals(userId).count(),
    db.categories.where("userId").equals(userId).count(),
    db.transactions.where("userId").equals(userId).count(),
    db.budgets.where("userId").equals(userId).count(),
    db.savingsGoals.where("userId").equals(userId).count(),
    db.savingsContributions.count(),
  ]);
  return { accounts, categories, transactions, budgets, goals, contributions };
}

describe("demo data", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    setActiveUserId(USER);
  });

  it("reports an empty account as eligible for demo data", async () => {
    await expect(isEmptyForDemo()).resolves.toBe(true);
  });

  it("reports a used account as not eligible", async () => {
    await db.accounts.put({
      id: "a1",
      userId: USER,
      name: "Cash",
      type: "cash",
      currency: CURRENCY,
      openingBalanceMinor: 0,
      isActive: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
    });

    await expect(isEmptyForDemo()).resolves.toBe(false);
  });

  it("seeds accounts, categories, transactions, budgets and goals", async () => {
    const result = await loadDemoData(CURRENCY);
    const counts = await countFor(USER);

    expect(result.accounts).toBe(2);
    expect(counts.accounts).toBe(2);
    expect(counts.categories).toBeGreaterThan(0);
    expect(counts.transactions).toBeGreaterThan(0);
    expect(counts.budgets).toBe(3);
    expect(counts.goals).toBe(2);
    expect(counts.contributions).toBe(2);
  });

  it("covers several months so trends and comparisons have real history", async () => {
    await loadDemoData(CURRENCY);
    const transactions = await db.transactions.where("userId").equals(USER).toArray();
    const months = new Set(transactions.map((tx) => tx.date.slice(0, 7)));

    expect(months.size).toBeGreaterThanOrEqual(4);
  });

  it("never writes a transaction dated in the future", async () => {
    await loadDemoData(CURRENCY);
    const transactions = await db.transactions.where("userId").equals(USER).toArray();
    const today = new Date().toISOString().slice(0, 10);

    expect(transactions.every((tx) => tx.date <= today)).toBe(true);
  });

  it("uses only the given currency, never mixing units", async () => {
    await loadDemoData(CURRENCY);
    const transactions = await db.transactions.where("userId").equals(USER).toArray();

    expect(transactions.every((tx) => tx.currency === CURRENCY)).toBe(true);
  });

  it("includes both income and expenses so the dashboard is not one-sided", async () => {
    await loadDemoData(CURRENCY);
    const transactions = await db.transactions.where("userId").equals(USER).toArray();

    expect(transactions.some((tx) => tx.type === "income")).toBe(true);
    expect(transactions.some((tx) => tx.type === "expense")).toBe(true);
  });

  it("keeps demo data scoped to the signed-in user", async () => {
    await loadDemoData(CURRENCY);
    const leaked = await db.transactions.where("userId").equals("someone-else").count();

    expect(leaked).toBe(0);
  });
});