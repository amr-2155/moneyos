import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./api";
import { db } from "./db";
import { setActiveUserId } from "./session";

const USER = "undo-user";

async function seedAccount() {
  return api.accounts.create({ name: "Bank", type: "bank", currency: "EGP", openingBalance: "0" });
}

describe("undo support", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    setActiveUserId(USER);
  });

  it("returns the deleted category so it can be restored", async () => {
    const category = await api.categories.create({ name: "Coffee", type: "expense" });

    const removed = await api.categories.remove(category.id);
    expect(removed.id).toBe(category.id);
    expect((await api.categories.list()).some((c) => c.id === category.id)).toBe(false);

    await api.categories.restoreDeleted(removed);

    const restored = (await api.categories.list()).find((c) => c.id === category.id);
    expect(restored?.name).toBe("Coffee");
  });

  it("refuses to delete a category that is still in use", async () => {
    const account = await seedAccount();
    const category = await api.categories.create({ name: "Food", type: "expense" });
    await api.transactions.create({
      type: "expense",
      amount: "50",
      accountId: account.id,
      categoryId: category.id,
      date: "2026-01-01",
    });

    await expect(api.categories.remove(category.id)).rejects.toThrow();
    expect((await api.categories.list()).some((c) => c.id === category.id)).toBe(true);
  });

  it("restores an archived budget", async () => {
    const category = await api.categories.create({ name: "Groceries", type: "expense" });
    const budget = await api.budgets.create({
      categoryId: category.id,
      amount: "1000",
      currency: "EGP",
      period: "monthly",
    });

    await api.budgets.archive(budget.id);
    expect(await db.budgets.get(budget.id)).toMatchObject({ isArchived: true });

    await api.budgets.restore(budget.id);
    expect(await db.budgets.get(budget.id)).toMatchObject({ isArchived: false });
  });

  it("restores an archived savings goal", async () => {
    const goal = await api.savingsGoals.create({ name: "Laptop", targetAmount: "3000", currency: "EGP" });

    await api.savingsGoals.archive(goal.id);
    expect(await db.savingsGoals.get(goal.id)).toMatchObject({ isArchived: true });

    await api.savingsGoals.restore(goal.id);
    expect(await db.savingsGoals.get(goal.id)).toMatchObject({ isArchived: false });
  });
});