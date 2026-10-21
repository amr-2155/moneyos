import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./api";
import { db } from "./db";
import { setActiveUserId } from "./session";
import { addMonths, today } from "./recurring";

const USER = "recurring-user";
const CURRENCY = "EGP";

async function seedAccount(id = "acc1") {
  await db.accounts.put({
    id,
    userId: USER,
    name: "Bank",
    type: "bank",
    currency: CURRENCY,
    openingBalanceMinor: 0,
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
  });
}

async function createRule(overrides: Partial<Parameters<typeof api.recurring.create>[0]> = {}) {
  await seedAccount();
  return api.recurring.create({
    name: "Rent",
    accountId: "acc1",
    categoryId: null,
    type: "expense",
    amount: "2000",
    frequency: "monthly",
    startDate: addMonths(today(), -2),
    ...overrides,
  });
}

async function linkedTransactions() {
  return db.transactions
    .where("userId")
    .equals(USER)
    .filter((tx) => tx.notes?.startsWith("[recurring]") === true)
    .toArray();
}

describe("recurring rules", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    setActiveUserId(USER);
  });

  it("creates a rule using the account currency, never a client-supplied one", async () => {
    const rule = await createRule();

    expect(rule.currency).toBe(CURRENCY);
    expect(rule.amountMinor).toBe(200_000);
    expect(rule.amount).toBe("2000.00");
  });

  it("rejects a rule pointing at another user's account", async () => {
    await db.accounts.put({
      id: "foreign",
      userId: "someone-else",
      name: "Theirs",
      type: "bank",
      currency: "USD",
      openingBalanceMinor: 0,
      isActive: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
    });

    await expect(
      api.recurring.create({
        name: "Theft",
        accountId: "foreign",
        categoryId: null,
        type: "expense",
        amount: "1",
        frequency: "monthly",
        startDate: today(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("materialises every due occurrence up to today", async () => {
    const rule = await createRule();
    const result = await api.recurring.materialise(rule.id);

    // Two months back plus the current one.
    expect(result.created).toBe(3);
    expect((await linkedTransactions()).length).toBe(3);
  });

  it("never books a transaction in the future", async () => {
    const rule = await createRule({ startDate: addMonths(today(), 2) });
    const result = await api.recurring.materialise(rule.id);

    expect(result.created).toBe(0);
  });

  it("is idempotent: materialising twice never duplicates a bill", async () => {
    const rule = await createRule();

    await api.recurring.materialise(rule.id);
    const second = await api.recurring.materialise(rule.id);

    expect(second.created).toBe(0);
    expect((await linkedTransactions()).length).toBe(3);
  });

  it("tags generated rows so they can be traced back to the rule", async () => {
    const rule = await createRule();
    await api.recurring.materialise(rule.id);

    const rows = await linkedTransactions();
    expect(rows.every((tx) => tx.notes?.includes(`rule=${rule.id}`))).toBe(true);
    expect(rows.every((tx) => tx.description === "Rent")).toBe(true);
  });

  it("keeps the generated amount and currency from the rule", async () => {
    const rule = await createRule({ type: "income", amount: "15000" });
    await api.recurring.materialise(rule.id);

    const rows = await linkedTransactions();
    expect(rows.every((tx) => tx.type === "income")).toBe(true);
    expect(rows.every((tx) => tx.amountMinor === 1_500_000)).toBe(true);
    expect(rows.every((tx) => tx.currency === CURRENCY)).toBe(true);
  });

  it("scopes materialised rows to the signed-in user", async () => {
    const rule = await createRule();
    await api.recurring.materialise(rule.id);

    const leaked = await db.transactions.where("userId").equals("someone-else").count();
    expect(leaked).toBe(0);
  });

  it("runs every rule at once and keeps going past a broken one", async () => {
    const good = await createRule({ name: "Rent" });
    await db.recurringRules.put({
      id: "broken",
      userId: USER,
      name: "Broken",
      accountId: "missing-account",
      categoryId: null,
      type: "expense",
      amountMinor: 1000,
      currency: CURRENCY,
      frequency: "monthly",
      startDate: addMonths(today(), -1),
      endDate: null,
      remindDaysBefore: 0,
      description: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const created = await api.recurring.materialiseAll();

    expect(created).toBeGreaterThan(0);
    expect((await linkedTransactions()).length).toBeGreaterThan(0);
    expect(good.id).toBeTruthy();
  });

  it("reports the next due date and reminder for a listed rule", async () => {
    await createRule({ startDate: addMonths(today(), 1), remindDaysBefore: 3 });
    const [rule] = await api.recurring.list();

    expect(rule?.nextDueDate).toBe(addMonths(today(), 1));
    expect(rule?.reminderDate).not.toBeNull();
  });

  it("stops producing occurrences once the end date passes", async () => {
    const rule = await createRule({ startDate: addMonths(today(), -3), endDate: addMonths(today(), -1) });
    await api.recurring.materialise(rule.id);

    const dates = (await linkedTransactions()).map((tx) => tx.date).sort();
    expect(dates).toEqual([addMonths(today(), -3), addMonths(today(), -2), addMonths(today(), -1)]);
  });

  it("removes a rule without touching already-booked transactions", async () => {
    const rule = await createRule();
    await api.recurring.materialise(rule.id);
    const before = (await linkedTransactions()).length;

    await api.recurring.remove(rule.id);

    expect(await db.recurringRules.get(rule.id)).toBeUndefined();
    expect((await linkedTransactions()).length).toBe(before);
  });
});