import { and, desc, eq, sql } from "drizzle-orm";
import { transactions } from "../../db/schema.js";
import { todayStr } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import { formatMinorToAmount } from "../../lib/money.js";
import { parseAmount } from "../../lib/zod.js";
function toView(transaction) {
    return {
        id: transaction.id,
        type: transaction.type,
        amount: formatMinorToAmount(transaction.amountMinor, transaction.currency),
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        description: transaction.description,
        notes: transaction.notes,
        date: transaction.date,
        transferId: transaction.transferId,
        reversalOfId: transaction.reversalOfId,
        reversedAt: transaction.reversedAt ? transaction.reversedAt.toISOString() : null,
        createdAt: transaction.createdAt.toISOString(),
    };
}
export class TransactionService {
    db;
    accounts;
    categories;
    constructor(db, accounts, categories) {
        this.db = db;
        this.accounts = accounts;
        this.categories = categories;
    }
    async create(userId, input) {
        const account = await this.accounts.getOwnedAccount(userId, input.accountId);
        const category = await this.categories.getSystemOrOwnedCategory(userId, input.categoryId);
        if (category.type !== "both" && category.type !== input.type) {
            throw AppError.badRequest(`Category "${category.name}" is a ${category.type} category and cannot be used for ${input.type}`);
        }
        const amountMinor = parseAmount(input.amount, account.currency);
        if (amountMinor === 0) {
            throw AppError.badRequest("Amount must be greater than zero");
        }
        const signedAmount = input.type === "income" ? amountMinor : -amountMinor;
        const created = await this.db
            .insert(transactions)
            .values({
            userId,
            accountId: account.id,
            type: input.type,
            amountMinor: signedAmount,
            currency: account.currency,
            categoryId: category.id,
            description: input.description ?? null,
            notes: input.notes ?? null,
            date: input.date,
        })
            .returning();
        return toView(created[0]);
    }
    async list(userId, query) {
        const conditions = [eq(transactions.userId, userId)];
        if (query.accountId) {
            conditions.push(eq(transactions.accountId, query.accountId));
        }
        if (query.categoryId) {
            conditions.push(eq(transactions.categoryId, query.categoryId));
        }
        if (query.type) {
            conditions.push(eq(transactions.type, query.type));
        }
        if (query.from) {
            conditions.push(sql `${transactions.date} >= ${query.from}`);
        }
        if (query.to) {
            conditions.push(sql `${transactions.date} <= ${query.to}`);
        }
        const where = and(...conditions);
        const countRow = await this.db
            .select({ count: sql `count(*)` })
            .from(transactions)
            .where(where)
            .get();
        const orderDirection = query.sort === "date_asc" ? transactions.date : desc(transactions.date);
        const rows = await this.db
            .select()
            .from(transactions)
            .where(where)
            .orderBy(orderDirection, desc(transactions.createdAt))
            .limit(query.limit)
            .offset((query.page - 1) * query.limit)
            .all();
        return {
            data: rows.map(toView),
            meta: { page: query.page, limit: query.limit, total: countRow?.count ?? 0 },
        };
    }
    async get(userId, transactionId) {
        const transaction = await this.db
            .select()
            .from(transactions)
            .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
            .get();
        if (!transaction) {
            throw AppError.notFound("Transaction not found");
        }
        return toView(transaction);
    }
    /**
     * Immutable ledger: reversing an income/expense inserts an offsetting entry
     * (flipped sign, same type/category) and marks the original as reversed.
     * Transfer legs are reversed through the transfer endpoint instead.
     */
    async reverse(userId, transactionId) {
        const original = await this.db
            .select()
            .from(transactions)
            .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
            .get();
        if (!original) {
            throw AppError.notFound("Transaction not found");
        }
        if (original.transferId) {
            throw AppError.badRequest("Reverse transfers through the transfer endpoint");
        }
        if (original.reversedAt) {
            throw AppError.conflict("Transaction is already reversed");
        }
        const now = new Date();
        const reversal = this.db.transaction((tx) => {
            const reversalRow = tx
                .insert(transactions)
                .values({
                userId,
                accountId: original.accountId,
                type: original.type,
                amountMinor: -original.amountMinor,
                currency: original.currency,
                categoryId: original.categoryId,
                description: original.description ? `Reversal: ${original.description}` : `Reversal of ${original.id}`,
                notes: original.notes,
                date: todayStr(),
                reversalOfId: original.id,
            })
                .returning()
                .get();
            tx.update(transactions)
                .set({ reversedAt: now, updatedAt: now })
                .where(eq(transactions.id, original.id))
                .run();
            return reversalRow;
        });
        return toView(reversal);
    }
}
//# sourceMappingURL=transactions.service.js.map