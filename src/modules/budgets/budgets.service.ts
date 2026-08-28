import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { budgets, categories, type Budget } from "../../db/schema.js";
import { monthRange } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import { expenseTotalForCategory } from "../../lib/ledger.js";
import { divideRound, formatMinorToAmount } from "../../lib/money.js";
import { parseAmount } from "../../lib/zod.js";
import type { CategoryService } from "../categories/categories.service.js";

export type BudgetStatus = "normal" | "approaching" | "exceeded";

export interface BudgetView {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string | null;
  color: string | null;
  period: string;
  amount: string;
  amountMinor: number;
  currency: string;
  spent: string;
  spentMinor: number;
  remaining: string;
  remainingMinor: number;
  percentUsed: number;
  status: BudgetStatus;
  warningThresholdPercent: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetListQuery {
  period?: string;
  includeArchived: boolean;
}

export class BudgetService {
  constructor(
    private readonly db: Db,
    private readonly categories: CategoryService,
  ) {}

  async create(
    userId: string,
    input: { categoryId: string; amount: string; currency: string; period: string; warningThresholdPercent: number },
  ): Promise<BudgetView> {
    const category = await this.categories.getSystemOrOwnedCategory(userId, input.categoryId);
    if (category.type === "income") {
      throw AppError.badRequest(
        `Category "${category.name}" is an income category and cannot be budgeted as spending`,
      );
    }

    const amountMinor = parseAmount(input.amount, input.currency);
    if (amountMinor === 0) {
      throw AppError.badRequest("Amount must be greater than zero");
    }

    await this.assertNoDuplicate(userId, input.categoryId, input.period);

    const created = await this.db
      .insert(budgets)
      .values({
        userId,
        categoryId: category.id,
        amountMinor,
        currency: input.currency,
        period: input.period,
        warningThresholdPercent: input.warningThresholdPercent,
      })
      .returning();

    return this.toView(created[0]!);
  }

  async list(userId: string, query: BudgetListQuery): Promise<BudgetView[]> {
    const conditions = [eq(budgets.userId, userId)];
    if (!query.includeArchived) {
      conditions.push(eq(budgets.isArchived, false));
    }
    if (query.period) {
      conditions.push(eq(budgets.period, query.period));
    }

    const rows = await this.db
      .select()
      .from(budgets)
      .where(and(...conditions))
      .orderBy(desc(budgets.period), desc(budgets.createdAt))
      .all();

    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async get(userId: string, budgetId: string): Promise<BudgetView> {
    const budget = await this.getOwnedBudget(userId, budgetId);
    return this.toView(budget);
  }

  async update(
    userId: string,
    budgetId: string,
    patch: {
      categoryId?: string;
      amount?: string;
      currency?: string;
      period?: string;
      warningThresholdPercent?: number;
    },
  ): Promise<BudgetView> {
    const budget = await this.getOwnedBudget(userId, budgetId);

    const categoryId = patch.categoryId ?? budget.categoryId;
    const period = patch.period ?? budget.period;
    if (patch.categoryId || patch.period) {
      if (categoryId !== budget.categoryId || period !== budget.period) {
        await this.assertNoDuplicate(userId, categoryId, period);
      }
      if (patch.categoryId) {
        const category = await this.categories.getSystemOrOwnedCategory(userId, patch.categoryId);
        if (category.type === "income") {
          throw AppError.badRequest(
            `Category "${category.name}" is an income category and cannot be budgeted as spending`,
          );
        }
      }
    }

    let amountMinor = budget.amountMinor;
    if (patch.amount !== undefined) {
      const currency = patch.currency ?? budget.currency;
      amountMinor = parseAmount(patch.amount, currency);
      if (amountMinor === 0) {
        throw AppError.badRequest("Amount must be greater than zero");
      }
    }

    const updated = await this.db
      .update(budgets)
      .set({
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.period !== undefined ? { period: patch.period } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.warningThresholdPercent !== undefined
          ? { warningThresholdPercent: patch.warningThresholdPercent }
          : {}),
        amountMinor,
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, budget.id), eq(budgets.userId, userId)))
      .returning();

    return this.toView(updated[0]!);
  }

  async archive(userId: string, budgetId: string): Promise<BudgetView> {
    const budget = await this.getOwnedBudget(userId, budgetId);
    const updated = await this.db
      .update(budgets)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(budgets.id, budget.id), eq(budgets.userId, userId)))
      .returning();
    return this.toView(updated[0]!);
  }

  private async getOwnedBudget(userId: string, budgetId: string): Promise<Budget> {
    const budget = await this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)))
      .get();
    if (!budget) {
      throw AppError.notFound("Budget not found");
    }
    return budget;
  }

  private async assertNoDuplicate(userId: string, categoryId: string, period: string): Promise<void> {
    const existing = await this.db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId), eq(budgets.period, period)))
      .get();
    if (existing) {
      throw AppError.conflict("A budget for this category and period already exists");
    }
  }

  private async toView(budget: Budget): Promise<BudgetView> {
    const { start, end } = monthRange(budget.period);
    const spentMinor = expenseTotalForCategory(
      this.db,
      budget.userId,
      budget.categoryId,
      { from: start, to: end },
      budget.currency,
    );

    const remainingMinor = budget.amountMinor - spentMinor;
    const percentUsed = divideRound(spentMinor, budget.amountMinor, 2);
    const status = this.statusFor(spentMinor, budget.amountMinor, percentUsed, budget.warningThresholdPercent);

    const category = await this.db
      .select({ name: categories.name, icon: categories.icon, color: categories.color })
      .from(categories)
      .where(eq(categories.id, budget.categoryId))
      .get();

    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: category?.name ?? "Uncategorized",
      icon: category?.icon ?? null,
      color: category?.color ?? null,
      period: budget.period,
      amount: formatMinorToAmount(budget.amountMinor, budget.currency),
      amountMinor: budget.amountMinor,
      currency: budget.currency,
      spent: formatMinorToAmount(spentMinor, budget.currency),
      spentMinor,
      remaining: formatMinorToAmount(remainingMinor, budget.currency),
      remainingMinor,
      percentUsed,
      status,
      warningThresholdPercent: budget.warningThresholdPercent,
      isArchived: budget.isArchived,
      createdAt: budget.createdAt.toISOString(),
      updatedAt: budget.updatedAt.toISOString(),
    };
  }

  private statusFor(
    spentMinor: number,
    amountMinor: number,
    percentUsed: number,
    warningThresholdPercent: number,
  ): BudgetStatus {
    if (spentMinor >= amountMinor) {
      return "exceeded";
    }
    if (percentUsed >= warningThresholdPercent) {
      return "approaching";
    }
    return "normal";
  }
}
