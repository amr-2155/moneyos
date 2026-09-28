import { accounts, budgets, categories, savingsContributions, savingsGoals, syncIdempotencyKeys, transactions, transactionTransfers, } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { parseAmount } from "../../lib/zod.js";
import { eq, and } from "drizzle-orm";
/**
 * Processes a batch of sync operations.
 *
 * Idempotency: each operationId is recorded in the sync_idempotency table
 * before processing. If the same operationId is seen again, it is returned
 * as DUPLICATE without re-processing.
 *
 * Ownership: the backend userId is derived from the JWT, never from the payload.
 */
export class SyncService {
    db;
    accounts;
    categories;
    budgets;
    savingsGoals;
    constructor(db, accounts, categories, budgets, savingsGoals) {
        this.db = db;
        this.accounts = accounts;
        this.categories = categories;
        this.budgets = budgets;
        this.savingsGoals = savingsGoals;
    }
    async processBatch(userId, ops) {
        const results = [];
        // Process transfers before transactions so that transfer direction
        // can be resolved when signing transaction legs.
        const ordered = [...ops].sort((a, b) => {
            if (a.entity === "transfer" && b.entity === "transaction")
                return -1;
            if (a.entity === "transaction" && b.entity === "transfer")
                return 1;
            return 0;
        });
        for (const op of ordered) {
            try {
                // 1. Idempotency check — has this operationId already been processed?
                const existing = await this.db
                    .select({ operationId: syncIdempotencyKeys.operationId })
                    .from(syncIdempotencyKeys)
                    .where(eq(syncIdempotencyKeys.operationId, op.operationId))
                    .get();
                if (existing) {
                    results.push({
                        operationId: op.operationId,
                        entity: op.entity,
                        entityId: op.entityId,
                        status: "DUPLICATE",
                    });
                    continue;
                }
                // 2. Record the idempotency key BEFORE processing.
                //    If the INSERT fails (duplicate), another request already won.
                await this.db.insert(syncIdempotencyKeys).values({
                    operationId: op.operationId,
                    userId,
                    entity: op.entity,
                    entityId: op.entityId,
                    operation: op.operation,
                    createdAt: new Date(),
                }).run();
                // 3. Process the operation.
                await this.processOperation(userId, op);
                results.push({
                    operationId: op.operationId,
                    entity: op.entity,
                    entityId: op.entityId,
                    status: "SUCCESS",
                });
            }
            catch (error) {
                const err = error;
                const isPermanent = err instanceof AppError && (err.code === "VALIDATION_ERROR" || err.code === "FORBIDDEN" || err.code === "NOT_FOUND");
                results.push({
                    operationId: op.operationId,
                    entity: op.entity,
                    entityId: op.entityId,
                    status: isPermanent ? "PERMANENT_ERROR" : "CONFLICT",
                    error: err.message,
                });
            }
        }
        return results;
    }
    async processOperation(userId, op) {
        switch (op.entity) {
            case "account":
                await this.syncAccount(userId, op);
                break;
            case "transaction":
                await this.syncTransaction(userId, op);
                break;
            case "transfer":
                await this.syncTransfer(userId, op);
                break;
            case "category":
                await this.syncCategory(userId, op);
                break;
            case "budget":
                await this.syncBudget(userId, op);
                break;
            case "savingsGoal":
                await this.syncSavingsGoal(userId, op);
                break;
            case "savingsContribution":
                await this.syncSavingsContribution(userId, op);
                break;
            default:
                throw AppError.badRequest(`Unknown entity type: ${op.entity}`);
        }
    }
    asStr(v) {
        if (v === null || v === undefined)
            return null;
        return String(v);
    }
    asNum(v) {
        if (v === null || v === undefined || v === "")
            return null;
        return Number(v);
    }
    /**
     * Converts the frontend's unsigned amountMinor to the backend's
     * signed convention.
     *
     * Backend ledger convention (src/lib/ledger.ts):
     *   income  > 0, expense < 0, transfer from-leg < 0, to-leg > 0
     *   reversals carry flipped signs.
     *
     * The frontend stores all amounts as unsigned positive values.
     * This method applies the correct sign at the sync boundary.
     */
    async signAmountForBackend(p) {
        const unsigned = Number(p.amountMinor);
        const txType = String(p.type);
        const isReversal = p.reversalOfId != null;
        const transferId = p.transferId ? String(p.transferId) : null;
        const accountId = p.accountId ? String(p.accountId) : null;
        let signed;
        if (txType === "income") {
            signed = unsigned;
        }
        else if (txType === "expense") {
            signed = -unsigned;
        }
        else if (txType === "transfer") {
            // Look up the transfer to determine this leg's direction.
            // from-account leg = negative, to-account leg = positive.
            if (transferId && accountId) {
                const transfer = await this.db
                    .select({ fromAccountId: transactionTransfers.fromAccountId, toAccountId: transactionTransfers.toAccountId })
                    .from(transactionTransfers)
                    .where(eq(transactionTransfers.id, transferId))
                    .get();
                if (transfer) {
                    if (transfer.fromAccountId === accountId) {
                        signed = -unsigned;
                    }
                    else if (transfer.toAccountId === accountId) {
                        signed = unsigned;
                    }
                    else {
                        signed = -unsigned;
                    }
                }
                else {
                    signed = -unsigned;
                }
            }
            else {
                signed = -unsigned;
            }
        }
        else {
            signed = -unsigned;
        }
        if (isReversal) {
            signed = -signed;
        }
        return signed;
    }
    // ─── Account ──────────────────────────────────────────────────────────────
    async syncAccount(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(accounts)
                .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
                .run();
            return;
        }
        const openingBalanceMinor = typeof p.openingBalanceMinor === "number"
            ? p.openingBalanceMinor
            : parseAmount(String(p.openingBalance ?? "0"), String(p.currency ?? "EGP"));
        if (op.operation === "CREATE") {
            this.db.$client
                .prepare(`INSERT INTO accounts (id, user_id, name, type, currency, opening_balance_minor, note, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             currency = excluded.currency,
             opening_balance_minor = excluded.opening_balance_minor,
             note = excluded.note,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at`)
                .run(id, userId, String(p.name), String(p.type), String(p.currency), openingBalanceMinor, p.note ?? null, p.isActive !== false, p.createdAt ? String(p.createdAt) : new Date().toISOString(), p.updatedAt ? String(p.updatedAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(accounts)
                .set({
                name: String(p.name),
                type: String(p.type),
                currency: String(p.currency),
                openingBalanceMinor,
                note: this.asStr(p.note),
                isActive: p.isActive !== false,
                updatedAt: new Date(),
            })
                .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
                .run();
        }
    }
    // ─── Transaction ─────────────────────────────────────────────────────────
    async syncTransaction(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(transactions)
                .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
                .run();
            return;
        }
        if (op.operation === "CREATE") {
            // Verify the account belongs to this user (IDOR prevention).
            const accountCheck = await this.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(and(eq(accounts.id, String(p.accountId)), eq(accounts.userId, userId)))
                .get();
            if (!accountCheck) {
                throw AppError.notFound("Account not found or not owned by user");
            }
            const signedAmount = await this.signAmountForBackend(p);
            this.db.$client
                .prepare(`INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_minor, currency, description, notes, date, reversal_of_id, reversed_at, transfer_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             account_id = excluded.account_id,
             category_id = excluded.category_id,
             amount_minor = excluded.amount_minor,
             description = excluded.description,
             notes = excluded.notes,
             date = excluded.date,
             updated_at = excluded.updated_at`)
                .run(id, userId, String(p.accountId), p.categoryId ? String(p.categoryId) : null, String(p.type), signedAmount, String(p.currency), p.description ?? null, p.notes ?? null, String(p.date), p.reversalOfId ? String(p.reversalOfId) : null, p.reversedAt ? String(p.reversedAt) : null, p.transferId ? String(p.transferId) : null, p.createdAt ? String(p.createdAt) : new Date().toISOString(), p.updatedAt ? String(p.updatedAt) : new Date().toISOString());
        }
        else {
            const signedAmount = await this.signAmountForBackend(p);
            await this.db
                .update(transactions)
                .set({
                accountId: String(p.accountId),
                categoryId: p.categoryId ? String(p.categoryId) : null,
                type: String(p.type),
                amountMinor: signedAmount,
                currency: String(p.currency),
                description: this.asStr(p.description),
                notes: this.asStr(p.notes),
                date: String(p.date),
                reversalOfId: p.reversalOfId ? String(p.reversalOfId) : null,
                reversedAt: p.reversedAt ? new Date(String(p.reversedAt)) : null,
                transferId: p.transferId ? String(p.transferId) : null,
                updatedAt: new Date(),
            })
                .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
                .run();
        }
    }
    // ─── Transfer ────────────────────────────────────────────────────────────
    async syncTransfer(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(transactionTransfers)
                .where(and(eq(transactionTransfers.id, id), eq(transactionTransfers.userId, userId)))
                .run();
            return;
        }
        if (op.operation === "CREATE") {
            // Verify both accounts belong to this user (IDOR prevention).
            const fromCheck = await this.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(and(eq(accounts.id, String(p.fromAccountId)), eq(accounts.userId, userId)))
                .get();
            const toCheck = await this.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(and(eq(accounts.id, String(p.toAccountId)), eq(accounts.userId, userId)))
                .get();
            if (!fromCheck || !toCheck) {
                throw AppError.notFound("Transfer account not found or not owned by user");
            }
            this.db.$client
                .prepare(`INSERT INTO transaction_transfers (id, user_id, from_account_id, to_account_id, amount_minor, currency, notes, from_transaction_id, to_transaction_id, reversed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             from_account_id = excluded.from_account_id,
             to_account_id = excluded.to_account_id,
             amount_minor = excluded.amount_minor,
             currency = excluded.currency,
             notes = excluded.notes,
             reversed_at = excluded.reversed_at`)
                .run(id, userId, String(p.fromAccountId), String(p.toAccountId), Number(p.amountMinor), String(p.currency), p.notes ?? null, p.fromTransactionId ? String(p.fromTransactionId) : null, p.toTransactionId ? String(p.toTransactionId) : null, p.reversedAt ? String(p.reversedAt) : null, p.createdAt ? String(p.createdAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(transactionTransfers)
                .set({
                fromAccountId: String(p.fromAccountId),
                toAccountId: String(p.toAccountId),
                amountMinor: Number(p.amountMinor),
                currency: String(p.currency),
                notes: this.asStr(p.notes),
                reversedAt: p.reversedAt ? new Date(String(p.reversedAt)) : null,
            })
                .where(and(eq(transactionTransfers.id, id), eq(transactionTransfers.userId, userId)))
                .run();
        }
    }
    // ─── Category ────────────────────────────────────────────────────────────
    async syncCategory(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(categories)
                .where(and(eq(categories.id, id), eq(categories.userId, userId)))
                .run();
            return;
        }
        if (op.operation === "CREATE") {
            this.db.$client
                .prepare(`INSERT INTO categories (id, user_id, parent_id, name, type, icon, color, sort_order, system, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             icon = excluded.icon,
             color = excluded.color,
             is_archived = excluded.is_archived,
             updated_at = excluded.updated_at`)
                .run(id, userId, p.parentId ? String(p.parentId) : null, String(p.name), String(p.type), p.icon ?? null, p.color ?? null, typeof p.sortOrder === "number" ? p.sortOrder : 0, p.system === true, p.isArchived === true, p.createdAt ? String(p.createdAt) : new Date().toISOString(), p.updatedAt ? String(p.updatedAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(categories)
                .set({
                name: String(p.name),
                type: String(p.type),
                parentId: p.parentId ? String(p.parentId) : null,
                icon: this.asStr(p.icon),
                color: this.asStr(p.color),
                isArchived: p.isArchived === true,
                updatedAt: new Date(),
            })
                .where(and(eq(categories.id, id), eq(categories.userId, userId)))
                .run();
        }
    }
    // ─── Budget ──────────────────────────────────────────────────────────────
    async syncBudget(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(budgets)
                .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
                .run();
            return;
        }
        const amountMinor = Number(p.amountMinor);
        if (op.operation === "CREATE") {
            this.db.$client
                .prepare(`INSERT INTO budgets (id, user_id, category_id, period, amount_minor, currency, spent_minor, warning_threshold_percent, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             category_id = excluded.category_id,
             period = excluded.period,
             amount_minor = excluded.amount_minor,
             currency = excluded.currency,
             warning_threshold_percent = excluded.warning_threshold_percent,
             is_archived = excluded.is_archived,
             updated_at = excluded.updated_at`)
                .run(id, userId, String(p.categoryId), String(p.period), amountMinor, String(p.currency), typeof p.spentMinor === "number" ? p.spentMinor : 0, typeof p.warningThresholdPercent === "number" ? p.warningThresholdPercent : 75, p.isArchived === true, p.createdAt ? String(p.createdAt) : new Date().toISOString(), p.updatedAt ? String(p.updatedAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(budgets)
                .set({
                categoryId: String(p.categoryId),
                period: String(p.period),
                amountMinor,
                currency: String(p.currency),
                warningThresholdPercent: typeof p.warningThresholdPercent === "number" ? p.warningThresholdPercent : 75,
                isArchived: p.isArchived === true,
                updatedAt: new Date(),
            })
                .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
                .run();
        }
    }
    // ─── Savings Goal ────────────────────────────────────────────────────────
    async syncSavingsGoal(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(savingsGoals)
                .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
                .run();
            return;
        }
        if (op.operation === "CREATE") {
            this.db.$client
                .prepare(`INSERT INTO savings_goals (id, user_id, name, target_minor, current_minor, currency, target_date, description, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             target_minor = excluded.target_minor,
             current_minor = excluded.current_minor,
             currency = excluded.currency,
             target_date = excluded.target_date,
             description = excluded.description,
             is_archived = excluded.is_archived,
             updated_at = excluded.updated_at`)
                .run(id, userId, String(p.name), Number(p.targetAmountMinor), Number(p.currentMinor ?? 0), String(p.currency), p.targetDate ? String(p.targetDate) : null, p.description ?? null, p.isArchived === true, p.createdAt ? String(p.createdAt) : new Date().toISOString(), p.updatedAt ? String(p.updatedAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(savingsGoals)
                .set({
                name: String(p.name),
                targetMinor: Number(p.targetAmountMinor),
                currentMinor: Number(p.currentMinor ?? 0),
                currency: String(p.currency),
                targetDate: this.asStr(p.targetDate),
                description: this.asStr(p.description),
                isArchived: p.isArchived === true,
                updatedAt: new Date(),
            })
                .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
                .run();
        }
    }
    // ─── Savings Contribution ────────────────────────────────────────────────
    async syncSavingsContribution(userId, op) {
        const p = op.payload;
        const id = op.entityId;
        if (op.operation === "DELETE") {
            await this.db
                .delete(savingsContributions)
                .where(and(eq(savingsContributions.id, id), eq(savingsContributions.userId, userId)))
                .run();
            return;
        }
        if (op.operation === "CREATE") {
            this.db.$client
                .prepare(`INSERT INTO savings_contributions (id, user_id, savings_goal_id, amount_minor, currency, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             savings_goal_id = excluded.savings_goal_id,
             amount_minor = excluded.amount_minor,
             currency = excluded.currency,
             note = excluded.note`)
                .run(id, userId, String(p.goalId ?? p.savingsGoalId), Number(p.amountMinor), String(p.currency), p.note ?? null, p.createdAt ? String(p.createdAt) : new Date().toISOString());
        }
        else {
            await this.db
                .update(savingsContributions)
                .set({
                savingsGoalId: String(p.goalId ?? p.savingsGoalId),
                amountMinor: Number(p.amountMinor),
                currency: String(p.currency),
                note: this.asStr(p.note),
            })
                .where(and(eq(savingsContributions.id, id), eq(savingsContributions.userId, userId)))
                .run();
        }
    }
}
//# sourceMappingURL=sync.service.js.map