import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { transactionTransfers, transactions, type TransactionTransfer } from "../../db/schema.js";
import { todayStr } from "../../lib/dates.js";
import { AppError } from "../../lib/errors.js";
import { formatMinorToAmount } from "../../lib/money.js";
import { parseAmount } from "../../lib/zod.js";
import type { AccountService } from "../accounts/accounts.service.js";
import type { TransactionView } from "../transactions/transactions.service.js";

export interface TransferView {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  amountMinor: number;
  currency: string;
  notes: string | null;
  date: string;
  reversedAt: string | null;
  createdAt: string;
  legs: TransactionView[];
}

function toTransactionView(row: typeof transactions.$inferSelect): TransactionView {
  return {
    id: row.id,
    type: row.type,
    amount: formatMinorToAmount(row.amountMinor, row.currency),
    amountMinor: row.amountMinor,
    currency: row.currency,
    accountId: row.accountId,
    categoryId: row.categoryId,
    description: row.description,
    notes: row.notes,
    date: row.date,
    transferId: row.transferId,
    reversalOfId: row.reversalOfId,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class TransferService {
  constructor(
    private readonly db: Db,
    private readonly accounts: AccountService,
  ) {}

  async create(
    userId: string,
    input: { fromAccountId: string; toAccountId: string; amount: string; date: string; notes?: string },
  ): Promise<TransferView> {
    if (input.fromAccountId === input.toAccountId) {
      throw AppError.badRequest("Source and destination accounts must be different");
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.accounts.getOwnedAccount(userId, input.fromAccountId),
      this.accounts.getOwnedAccount(userId, input.toAccountId),
    ]);

    if (fromAccount.currency !== toAccount.currency) {
      throw AppError.badRequest(
        `Transfers between currencies are not supported yet (${fromAccount.currency} -> ${toAccount.currency}). Currency conversion is out of scope for the MVP.`,
      );
    }

    const amountMinor = parseAmount(input.amount, fromAccount.currency);
    if (amountMinor === 0) {
      throw AppError.badRequest("Amount must be greater than zero");
    }

    const transfer = this.db.transaction((tx) =>
      this.insertTransferRows(tx, {
        userId,
        fromAccount,
        toAccount,
        amountMinor,
        currency: fromAccount.currency,
        date: input.date,
        notes: input.notes ?? null,
      }),
    );

    return transfer;
  }

  private insertTransferRows(
    executor: Pick<Db, "insert" | "update">,
    params: {
      userId: string;
      fromAccount: { id: string; name: string };
      toAccount: { id: string; name: string };
      amountMinor: number;
      currency: string;
      date: string;
      notes: string | null;
    },
  ): TransferView {
    const transferRow = executor
      .insert(transactionTransfers)
      .values({
        userId: params.userId,
        fromAccountId: params.fromAccount.id,
        toAccountId: params.toAccount.id,
        amountMinor: params.amountMinor,
        currency: params.currency,
        notes: params.notes,
      })
      .returning()
      .get();

    const fromLeg = executor
      .insert(transactions)
      .values({
        userId: params.userId,
        accountId: params.fromAccount.id,
        type: "transfer",
        amountMinor: -params.amountMinor,
        currency: params.currency,
        description: `Transfer to ${params.toAccount.name}`,
        notes: params.notes,
        date: params.date,
        transferId: transferRow.id,
      })
      .returning()
      .get();

    const toLeg = executor
      .insert(transactions)
      .values({
        userId: params.userId,
        accountId: params.toAccount.id,
        type: "transfer",
        amountMinor: params.amountMinor,
        currency: params.currency,
        description: `Transfer from ${params.fromAccount.name}`,
        notes: params.notes,
        date: params.date,
        transferId: transferRow.id,
      })
      .returning()
      .get();

    executor
      .update(transactionTransfers)
      .set({ fromTransactionId: fromLeg.id, toTransactionId: toLeg.id })
      .where(eq(transactionTransfers.id, transferRow.id))
      .run();

    return this.getTransferView(transferRow);
  }

  async list(
    userId: string,
    query: { page: number; limit: number },
  ): Promise<{ data: TransferView[]; meta: { page: number; limit: number; total: number } }> {
    const countRow = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(transactionTransfers)
      .where(eq(transactionTransfers.userId, userId))
      .get();

    const rows = await this.db
      .select()
      .from(transactionTransfers)
      .where(eq(transactionTransfers.userId, userId))
      .orderBy(desc(transactionTransfers.createdAt))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();

    const views = await Promise.all(rows.map((row) => this.getTransferView(row)));
    return {
      data: views,
      meta: { page: query.page, limit: query.limit, total: countRow?.count ?? 0 },
    };
  }

  /** Reverses a transfer by creating an equal transfer in the opposite direction. */
  async reverse(userId: string, transferId: string): Promise<TransferView> {
    const transfer = await this.db
      .select()
      .from(transactionTransfers)
      .where(and(eq(transactionTransfers.id, transferId), eq(transactionTransfers.userId, userId)))
      .get();
    if (!transfer) {
      throw AppError.notFound("Transfer not found");
    }
    if (transfer.reversedAt) {
      throw AppError.conflict("Transfer is already reversed");
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.accounts.getOwnedAccount(userId, transfer.toAccountId, { includeInactive: true }),
      this.accounts.getOwnedAccount(userId, transfer.fromAccountId, { includeInactive: true }),
    ]);

    const reversal = this.db.transaction((tx) => {
      const now = new Date();
      const created = this.insertTransferRows(tx, {
        userId,
        fromAccount,
        toAccount,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        date: todayStr(),
        notes: transfer.notes ? `Reversal: ${transfer.notes}` : `Reversal of transfer ${transfer.id}`,
      });
      tx.update(transactionTransfers)
        .set({ reversedAt: now })
        .where(eq(transactionTransfers.id, transfer.id))
        .run();
      return created;
    });

    return reversal;
  }

  private getTransferView(transfer: TransactionTransfer): TransferView {
    const legs = this.db
      .select()
      .from(transactions)
      .where(eq(transactions.transferId, transfer.id))
      .all();

    const fromLeg = legs.find((leg) => leg.accountId === transfer.fromAccountId) ?? legs[0]!;
    return {
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: formatMinorToAmount(transfer.amountMinor, transfer.currency),
      amountMinor: transfer.amountMinor,
      currency: transfer.currency,
      notes: transfer.notes,
      date: fromLeg.date,
      reversedAt: transfer.reversedAt ? transfer.reversedAt.toISOString() : null,
      createdAt: transfer.createdAt.toISOString(),
      legs: legs.map(toTransactionView),
    };
  }
}
