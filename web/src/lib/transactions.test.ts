import { describe, expect, it } from "vitest";
import type { CategoryView } from "./api";
import { transactionCategoryOptions } from "./transactions";

const system = (id: string, name: string, type: CategoryView["type"]): CategoryView => ({
  id,
  name,
  type,
  parentId: null,
  icon: null,
  color: null,
  system: true,
  isArchived: false,
});

const categories: CategoryView[] = [
  system("salary", "Salary", "income"),
  system("food", "Food & Dining", "expense"),
  { id: "u1", name: "Side gig", type: "income", parentId: null, icon: null, color: null, system: false, isArchived: false },
  { id: "u2", name: "Both", type: "both", parentId: null, icon: null, color: null, system: false, isArchived: false },
  { id: "u3", name: "Old", type: "expense", parentId: null, icon: null, color: null, system: false, isArchived: true },
];

describe("transactionCategoryOptions", () => {
  it("includes system categories for their matching type", () => {
    const income = transactionCategoryOptions(categories, "income");
    expect(income.map((c) => c.id)).toContain("salary");
    expect(income.map((c) => c.id)).toContain("u1");
    expect(income.map((c) => c.id)).toContain("u2");
    expect(income.map((c) => c.id)).not.toContain("food");
  });

  it("includes only expense and both categories for expense", () => {
    const expense = transactionCategoryOptions(categories, "expense");
    expect(expense.map((c) => c.id)).toContain("food");
    expect(expense.map((c) => c.id)).toContain("u2");
    expect(expense.map((c) => c.id)).not.toContain("salary");
    expect(expense.map((c) => c.id)).not.toContain("u1");
  });

  it("excludes archived categories", () => {
    const expense = transactionCategoryOptions(categories, "expense");
    expect(expense.map((c) => c.id)).not.toContain("u3");
  });
});
