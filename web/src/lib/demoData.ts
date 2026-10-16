import { db, uid, type AccountRecord, type BudgetRecord, type CategoryRecord, type SavingsContributionRecord, type SavingsGoalRecord, type TransactionRecord } from "./db";
import { currentUserId } from "./session";
import { parseAmountToMinor } from "./money";

/**
 * Seeds a realistic month of activity so a brand-new user can see the app do
 * something instead of an empty shell. Everything is written through the normal
 * tables and scoped to the signed-in user, so it can be removed with the same
 * "delete all data" control the app already has.
 */

const DAY = 86_400_000;

function isoDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}

function monthKey(offsetMonths = 0): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1).toISOString().slice(0, 7);
}

function minor(amount: string, currency: string): number {
  return parseAmountToMinor(amount, currency);
}

interface DemoCategorySeed {
  key: string;
  name: string;
  type: "income" | "expense";
  color: string;
}

const CATEGORIES: DemoCategorySeed[] = [
  { key: "salary", name: "Salary", type: "income", color: "#10B981" },
  { key: "freelance", name: "Freelance", type: "income", color: "#34D399" },
  { key: "food", name: "Food & Dining", type: "expense", color: "#F59E0B" },
  { key: "groceries", name: "Groceries", type: "expense", color: "#FBBF24" },
  { key: "transport", name: "Transport", type: "expense", color: "#60A5FA" },
  { key: "bills", name: "Bills & Utilities", type: "expense", color: "#A78BFA" },
  { key: "shopping", name: "Shopping", type: "expense", color: "#F472B6" },
  { key: "health", name: "Health", type: "expense", color: "#34D399" },
  { key: "entertainment", name: "Entertainment", type: "expense", color: "#C084FC" },
  { key: "other", name: "Other", type: "expense", color: "#94A3B8" },
];

/** Recurring monthly income and the fixed costs that make a budget believable. */
const MONTHLY = [
  { day: 1, type: "income" as const, category: "salary", amount: "28000", description: "Monthly salary" },
  { day: 2, type: "expense" as const, category: "bills", amount: "3200", description: "Rent" },
  { day: 3, type: "expense" as const, category: "bills", amount: "850", description: "Electricity & water" },
  { day: 5, type: "expense" as const, category: "entertainment", amount: "349", description: "Streaming subscription" },
];

/** Everyday spending, varied enough that no two months look identical. */
const VARIABLE = [
  { category: "groceries", amount: ["1850", "2400", "1320", "2760"], description: ["Supermarket", "Weekly groceries"] },
  { category: "food", amount: ["320", "540", "410", "680", "295"], description: ["Lunch out", "Coffee & pastry", "Dinner"] },
  { category: "transport", amount: ["180", "260", "340", "95"], description: ["Uber ride", "Fuel", "Metro card"] },
  { category: "shopping", amount: ["750", "1200", "460"], description: ["Clothes", "Household"] },
  { category: "health", amount: ["420", "900"], description: ["Pharmacy", "Dentist"] },
  { category: "other", amount: ["150", "230"], description: ["Misc"] },
];

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length]!;
}

/**
 * Creates demo accounts, categories and four months of transactions.
 * Returns a short summary for the confirmation toast.
 */
export async function loadDemoData(currency: string): Promise<{ transactions: number; accounts: number }> {
  const userId = currentUserId();

  const accounts: AccountRecord[] = [
    {
      id: uid(),
      userId,
      name: "Cash",
      type: "cash",
      currency,
      openingBalanceMinor: minor("1500", currency),
      isActive: true,
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: uid(),
      userId,
      name: "Bank",
      type: "bank",
      currency,
      openingBalanceMinor: minor("24000", currency),
      isActive: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
    },
  ];

  const categories: CategoryRecord[] = CATEGORIES.map((seed, index) => ({
    id: uid(),
    userId,
    name: seed.name,
    type: seed.type,
    parentId: null,
    icon: null,
    color: seed.color,
    sortOrder: index,
    system: true,
    isArchived: false,
  }));
  const categoryId = new Map(categories.map((category) => [category.name, category.id]));

  const transactions: TransactionRecord[] = [];
  let seed = 7;

  // Four months back so the trend chart and period comparison have real history.
  for (let back = 3; back >= 0; back -= 1) {
    const month = monthKey(-back);
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

    const push = (day: number, type: "income" | "expense", category: string, amount: string, description: string) => {
      // Never write into the future: the current month stops at today.
      const date = `${month}-${String(Math.min(day, daysInMonth)).padStart(2, "0")}`;
      if (date > new Date().toISOString().slice(0, 10)) return;
      seed += 3;
      transactions.push({
        id: uid(),
        userId,
        accountId: accounts[1]!.id,
        categoryId: categoryId.get(category) ?? null,
        type,
        amountMinor: minor(amount, currency),
        currency,
        date,
        description,
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId: null,
        createdAt: new Date().toISOString(),
      });
    };

    for (const entry of MONTHLY) {
      push(entry.day, entry.type, entry.category, entry.amount, entry.description);
    }
    if (back > 0) {
      push(14, "income", "freelance", "4200", "Freelance project");
    }

    for (const entry of VARIABLE) {
      const times = 3 + (seed % 3);
      for (let index = 0; index < times; index += 1) {
        seed += 1;
        const day = 2 + ((seed * 7) % Math.max(1, daysInMonth - 2));
        push(day, "expense", entry.category, pick(entry.amount, seed), pick(entry.description, seed));
      }
    }
  }

  const budgets: BudgetRecord[] = ["Food & Dining", "Transport", "Shopping"].map((name) => {
    const limits: Record<string, string> = {
      "Food & Dining": "4500",
      Transport: "1800",
      Shopping: "3000",
    };
    return {
      id: uid(),
      userId,
      categoryId: categoryId.get(name) ?? "",
      amountMinor: minor(limits[name]!, currency),
      currency,
      period: monthKey(0),
      warningThresholdPercent: 75,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const umrah: SavingsGoalRecord = {
    id: uid(),
    userId,
    name: "Umrah",
    currency,
    targetAmountMinor: minor("60000", currency),
    currentMinor: minor("18500", currency),
    targetDate: isoDate(-210),
    description: "Trip in the spring",
    isArchived: false,
    achievedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const emergency: SavingsGoalRecord = {
    id: uid(),
    userId,
    name: "Emergency fund",
    currency,
    targetAmountMinor: minor("90000", currency),
    currentMinor: minor("52000", currency),
    targetDate: null,
    description: "Six months of expenses",
    isArchived: false,
    achievedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const contributions: SavingsContributionRecord[] = [
    {
      id: uid(),
      goalId: umrah.id,
      amountMinor: minor("18500", currency),
      note: "Monthly savings",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid(),
      goalId: emergency.id,
      amountMinor: minor("52000", currency),
      note: "Monthly savings",
      createdAt: new Date().toISOString(),
    },
  ];

  await db.transaction("rw", [db.accounts, db.categories, db.transactions, db.budgets, db.savingsGoals, db.savingsContributions], async () => {
    await db.accounts.bulkPut(accounts);
    await db.categories.bulkPut(categories);
    await db.transactions.bulkPut(transactions);
    await db.budgets.bulkPut(budgets);
    await db.savingsGoals.bulkPut([umrah, emergency]);
    await db.savingsContributions.bulkPut(contributions);
  });

  return { transactions: transactions.length, accounts: accounts.length };
}

/** True when the user has nothing to lose by loading demo data. */
export async function isEmptyForDemo(): Promise<boolean> {
  const userId = currentUserId();
  const [accounts, transactions, goals] = await Promise.all([
    db.accounts.where("userId").equals(userId).count(),
    db.transactions.where("userId").equals(userId).count(),
    db.savingsGoals.where("userId").equals(userId).count(),
  ]);
  return accounts === 0 && transactions === 0 && goals === 0;
}