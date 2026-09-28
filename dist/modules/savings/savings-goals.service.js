import { and, desc, eq } from "drizzle-orm";
import { savingsContributions, savingsGoals } from "../../db/schema.js";
import { addMonths, currentMonthStr, todayStr } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import { totalsByMonthTypeAndCurrency } from "../../lib/ledger.js";
import { divideRound, formatMinorToAmount } from "../../lib/money.js";
import { parseAmount } from "../../lib/zod.js";
function monthsBetween(monthA, monthB) {
    const [ay, am] = monthA.split("-").map(Number);
    const [by, bm] = monthB.split("-").map(Number);
    return (by * 12 + bm) - (ay * 12 + am);
}
function ceilDivide(a, b) {
    return Math.floor((a + b - 1) / b);
}
export class SavingsGoalService {
    db;
    constructor(db) {
        this.db = db;
    }
    async create(userId, input) {
        const targetMinor = parseAmount(input.targetAmount, input.currency);
        if (targetMinor === 0) {
            throw AppError.badRequest("Target amount must be greater than zero");
        }
        const initialMinor = input.currentAmount !== undefined
            ? parseAmount(input.currentAmount, input.currency)
            : 0;
        if (initialMinor < 0) {
            throw AppError.badRequest("Starting amount cannot be negative");
        }
        if (initialMinor > targetMinor) {
            throw AppError.badRequest("Starting amount cannot exceed the target");
        }
        const created = await this.db.transaction((tx) => {
            const goal = tx
                .insert(savingsGoals)
                .values({
                userId,
                name: input.name,
                targetMinor,
                currentMinor: initialMinor,
                currency: input.currency,
                targetDate: input.targetDate ?? null,
                description: input.description ?? null,
            })
                .returning()
                .get();
            if (initialMinor > 0) {
                tx.insert(savingsContributions)
                    .values({
                    userId,
                    savingsGoalId: goal.id,
                    amountMinor: initialMinor,
                    currency: input.currency,
                    note: "Initial balance",
                })
                    .run();
            }
            return goal;
        });
        return this.toView(created);
    }
    async list(userId, query) {
        const conditions = [eq(savingsGoals.userId, userId)];
        if (!query.includeArchived) {
            conditions.push(eq(savingsGoals.isArchived, false));
        }
        const rows = await this.db
            .select()
            .from(savingsGoals)
            .where(and(...conditions))
            .orderBy(desc(savingsGoals.createdAt))
            .all();
        return Promise.all(rows.map((row) => this.toView(row)));
    }
    async get(userId, goalId) {
        return this.toView(await this.getOwnedGoal(userId, goalId));
    }
    async update(userId, goalId, patch) {
        const goal = await this.getOwnedGoal(userId, goalId);
        if (patch.currency && patch.currency !== goal.currency) {
            const hasContributions = await this.db
                .select({ id: savingsContributions.id })
                .from(savingsContributions)
                .where(eq(savingsContributions.savingsGoalId, goal.id))
                .limit(1)
                .get();
            if (hasContributions) {
                throw AppError.badRequest("Currency cannot be changed once contributions exist (no silent conversion)");
            }
        }
        let targetMinor = goal.targetMinor;
        if (patch.targetAmount !== undefined) {
            const currency = patch.currency ?? goal.currency;
            targetMinor = parseAmount(patch.targetAmount, currency);
            if (targetMinor === 0) {
                throw AppError.badRequest("Target amount must be greater than zero");
            }
            if (goal.currentMinor > targetMinor) {
                throw AppError.badRequest("Target cannot be lower than the current amount");
            }
        }
        const updated = await this.db
            .update(savingsGoals)
            .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
            ...(patch.targetDate !== undefined ? { targetDate: patch.targetDate } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            targetMinor,
            updatedAt: new Date(),
        })
            .where(and(eq(savingsGoals.id, goal.id), eq(savingsGoals.userId, userId)))
            .returning();
        return this.toView(updated[0]);
    }
    async archive(userId, goalId) {
        const goal = await this.getOwnedGoal(userId, goalId);
        const updated = await this.db
            .update(savingsGoals)
            .set({ isArchived: true, updatedAt: new Date() })
            .where(and(eq(savingsGoals.id, goal.id), eq(savingsGoals.userId, userId)))
            .returning();
        return this.toView(updated[0]);
    }
    async addContribution(userId, goalId, input) {
        const goal = await this.getOwnedGoal(userId, goalId);
        if (goal.isArchived) {
            throw AppError.badRequest("Goal is archived");
        }
        const amountMinor = parseAmount(input.amount, goal.currency);
        if (amountMinor <= 0) {
            throw AppError.badRequest("Contribution must be greater than zero");
        }
        const updated = await this.db.transaction((tx) => {
            tx.insert(savingsContributions)
                .values({
                userId,
                savingsGoalId: goal.id,
                amountMinor,
                currency: goal.currency,
                note: input.note ?? null,
            })
                .run();
            return tx
                .update(savingsGoals)
                .set({ currentMinor: goal.currentMinor + amountMinor, updatedAt: new Date() })
                .where(and(eq(savingsGoals.id, goal.id), eq(savingsGoals.userId, userId)))
                .returning()
                .get();
        });
        return this.toView(updated);
    }
    async listContributions(userId, goalId) {
        const goal = await this.getOwnedGoal(userId, goalId);
        const rows = await this.db
            .select()
            .from(savingsContributions)
            .where(and(eq(savingsContributions.savingsGoalId, goal.id), eq(savingsContributions.userId, userId)))
            .orderBy(desc(savingsContributions.createdAt))
            .all();
        return rows.map(toContributionView);
    }
    async getOwnedGoal(userId, goalId) {
        const goal = await this.db
            .select()
            .from(savingsGoals)
            .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)))
            .get();
        if (!goal) {
            throw AppError.notFound("Savings goal not found");
        }
        return goal;
    }
    async toView(goal) {
        const progressPercent = divideRound(goal.currentMinor, goal.targetMinor, 2);
        const achieved = goal.currentMinor >= goal.targetMinor;
        const remainingMinor = Math.max(0, goal.targetMinor - goal.currentMinor);
        const requiredMonthly = this.computeRequiredMonthly(goal, remainingMinor);
        const completionMonth = await this.computeCompletionMonth(goal);
        return {
            id: goal.id,
            name: goal.name,
            targetAmount: formatMinorToAmount(goal.targetMinor, goal.currency),
            targetAmountMinor: goal.targetMinor,
            currentAmount: formatMinorToAmount(goal.currentMinor, goal.currency),
            currentMinor: goal.currentMinor,
            currency: goal.currency,
            targetDate: goal.targetDate,
            description: goal.description,
            progressPercent,
            achieved,
            remainingAmount: formatMinorToAmount(remainingMinor, goal.currency),
            remainingMinor,
            isArchived: goal.isArchived,
            estimates: {
                requiredMonthly: requiredMonthly ? formatMinorToAmount(requiredMonthly, goal.currency) : null,
                requiredMonthlyMinor: requiredMonthly,
                completionMonth,
            },
            createdAt: goal.createdAt.toISOString(),
            updatedAt: goal.updatedAt.toISOString(),
        };
    }
    /**
     * Monthly amount required to reach the target by targetDate (an estimate).
     * Returns null when there is no target date or the date has already passed.
     */
    computeRequiredMonthly(goal, remainingMinor) {
        if (!goal.targetDate || goal.targetDate <= todayStr() || remainingMinor <= 0) {
            return null;
        }
        const months = Math.max(1, monthsBetween(todayStr().slice(0, 7), goal.targetDate.slice(0, 7)));
        return ceilDivide(remainingMinor, months);
    }
    /**
     * Projected `YYYY-MM` completion based on the average monthly savings in the
     * goal's currency over the last 6 months. An estimate; null when the goal is
     * achieved, there is nothing saved, or recent savings are not positive.
     */
    async computeCompletionMonth(goal) {
        if (goal.currentMinor >= goal.targetMinor) {
            return null;
        }
        const remainingMinor = goal.targetMinor - goal.currentMinor;
        const toMonth = currentMonthStr();
        const fromMonth = addMonths(toMonth, -5);
        const rows = totalsByMonthTypeAndCurrency(this.db, goal.userId, { fromMonth, toMonth }, goal.currency);
        let savingsSum = 0;
        for (const month of [fromMonth, addMonths(fromMonth, 1), addMonths(fromMonth, 2), addMonths(fromMonth, 3), addMonths(fromMonth, 4), toMonth]) {
            const income = rows.find((r) => r.month === month && r.type === "income")?.totalMinor ?? 0;
            const expenses = rows.find((r) => r.month === month && r.type === "expense")?.totalMinor ?? 0;
            savingsSum += income + expenses;
        }
        const avgMonthly = divideRound(savingsSum, 6, 0);
        if (avgMonthly <= 0) {
            return null;
        }
        const months = ceilDivide(remainingMinor, avgMonthly);
        return addMonths(toMonth, months);
    }
}
function toContributionView(row) {
    return {
        id: row.id,
        savingsGoalId: row.savingsGoalId,
        amount: formatMinorToAmount(row.amountMinor, row.currency),
        amountMinor: row.amountMinor,
        currency: row.currency,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
    };
}
//# sourceMappingURL=savings-goals.service.js.map