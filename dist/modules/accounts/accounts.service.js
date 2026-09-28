import { and, eq } from "drizzle-orm";
import { accounts } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";
import { computeAccountBalance, computeAccountBalances } from "../../lib/ledger.js";
import { formatMinorToAmount } from "../../lib/money.js";
import { parseAmount } from "../../lib/zod.js";
function toView(account, balanceMinor) {
    return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        openingBalance: formatMinorToAmount(account.openingBalanceMinor, account.currency),
        openingBalanceMinor: account.openingBalanceMinor,
        balance: formatMinorToAmount(balanceMinor, account.currency),
        balanceMinor,
        note: account.note,
        isActive: account.isActive,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
    };
}
export class AccountService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(userId) {
        const balances = new Map(computeAccountBalances(this.db, userId).map((b) => [b.accountId, b.balanceMinor]));
        const rows = await this.db.select().from(accounts).where(eq(accounts.userId, userId)).all();
        return rows.map((row) => toView(row, balances.get(row.id) ?? row.openingBalanceMinor));
    }
    async get(userId, accountId) {
        const account = await this.getOwnedAccount(userId, accountId, { includeInactive: true });
        const balance = computeAccountBalance(this.db, userId, accountId);
        return toView(account, balance);
    }
    async create(userId, input) {
        const openingBalanceMinor = parseAmount(input.openingBalance, input.currency);
        const created = await this.db
            .insert(accounts)
            .values({
            userId,
            name: input.name,
            type: input.type,
            currency: input.currency,
            openingBalanceMinor,
            note: input.note ?? null,
        })
            .returning();
        return toView(created[0], openingBalanceMinor);
    }
    async update(userId, accountId, patch) {
        const account = await this.getOwnedAccount(userId, accountId, { includeInactive: true });
        const updated = await this.db
            .update(accounts)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(eq(accounts.id, account.id), eq(accounts.userId, userId)))
            .returning();
        const balance = computeAccountBalance(this.db, userId, accountId);
        return toView(updated[0], balance);
    }
    async setActive(userId, accountId, isActive) {
        const account = await this.getOwnedAccount(userId, accountId, { includeInactive: true });
        const updated = await this.db
            .update(accounts)
            .set({ isActive, updatedAt: new Date() })
            .where(and(eq(accounts.id, account.id), eq(accounts.userId, userId)))
            .returning();
        const balance = computeAccountBalance(this.db, userId, accountId);
        return toView(updated[0], balance);
    }
    /**
     * Returns an owned account row or throws. `includeInactive` allows reading
     * archived accounts; mutation of financial state on archived accounts is
     * rejected by the caller where appropriate.
     */
    async getOwnedAccount(userId, accountId, options = {}) {
        const account = await this.db
            .select()
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
            .get();
        if (!account) {
            throw AppError.notFound("Account not found");
        }
        if (!options.includeInactive && !account.isActive) {
            throw AppError.badRequest("Account is archived");
        }
        return account;
    }
}
//# sourceMappingURL=accounts.service.js.map