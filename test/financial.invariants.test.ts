/**
 * Financial invariant tests — Phase 9.1
 *
 * These tests verify the core financial correctness of the sync pipeline
 * after the sign-convention fix. Every test exercises the real
 * SyncService.processBatch() with the real backend database and
 * verifies the resulting ledger state through the backend's own
 * query/aggregation functions (computeAccountBalances, totalsByTypeAndCurrency,
 * netWorthTrend, etc.).
 *
 * Signing convention (backend):
 *   income  > 0
 *   expense < 0
 *   transfer from-leg < 0
 *   transfer to-leg   > 0
 *   reversal            = flipped sign of original
 */
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestApp, type TestContext } from "./helpers.js";
import {
  auth,
  createAccount,
  createCategory,
  createTransaction,
  signupUser,
} from "./financial.helpers.js";
import { SyncService, type SyncOperationInput } from "../src/modules/sync/sync.service.js";
import { AccountService } from "../src/modules/accounts/accounts.service.js";
import { CategoryService } from "../src/modules/categories/categories.service.js";
import { BudgetService } from "../src/modules/budgets/budgets.service.js";
import { SavingsGoalService } from "../src/modules/savings/savings-goals.service.js";
import { transactions, transactionTransfers } from "../src/db/schema.js";
import { computeAccountBalances, computeAccountBalance } from "../src/lib/ledger.js";
import { formatMinorToAmount } from "../src/lib/money.js";

function makeSyncService(ctx: TestContext): SyncService {
  return new SyncService(
    ctx.db,
    new AccountService(ctx.db),
    new CategoryService(ctx.db),
    new BudgetService(ctx.db, new CategoryService(ctx.db)),
    new SavingsGoalService(ctx.db),
  );
}

describe("Phase 9.1: Financial Sync Invariants", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  /* ── 1. Income sync ────────────────────────────────────── */
  it("income sync stores positive signed amount", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-income@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

    const syncService = makeSyncService(ctx);
    const op: SyncOperationInput = {
      operationId: "inv-income-001",
      entity: "transaction",
      entityId: "sync-income-001",
      operation: "CREATE",
      payload: {
        id: "sync-income-001",
        accountId: account.id,
        categoryId: incomeCat.id,
        type: "income",
        amountMinor: 100000,
        currency: "EGP",
        date: "2026-08-15",
        description: "Test income",
      },
    };

    const results = await syncService.processBatch(userId, [op]);
    expect(results[0]?.status).toBe("SUCCESS");

    const tx = await ctx.db
      .select({ amountMinor: transactions.amountMinor, type: transactions.type })
      .from(transactions)
      .where(eq(transactions.id, "sync-income-001"))
      .get();
    expect(tx).toBeDefined();
    expect(tx!.amountMinor).toBe(100000); // positive
    expect(tx!.type).toBe("income");
  });

  /* ── 2. Expense sync ───────────────────────────────────── */
  it("expense sync stores negative signed amount", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-expense@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);
    const op: SyncOperationInput = {
      operationId: "inv-expense-001",
      entity: "transaction",
      entityId: "sync-expense-001",
      operation: "CREATE",
      payload: {
        id: "sync-expense-001",
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amountMinor: 50000,
        currency: "EGP",
        date: "2026-08-20",
        description: "Test expense",
      },
    };

    const results = await syncService.processBatch(userId, [op]);
    expect(results[0]?.status).toBe("SUCCESS");

    const tx = await ctx.db
      .select({ amountMinor: transactions.amountMinor, type: transactions.type })
      .from(transactions)
      .where(eq(transactions.id, "sync-expense-001"))
      .get();
    expect(tx).toBeDefined();
    expect(tx!.amountMinor).toBe(-50000); // negative
    expect(tx!.type).toBe("expense");
  });

  /* ── 3. Account balance ────────────────────────────────── */
  it("account balance reflects income minus expenses", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-balance@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);

    // Income 1000
    await syncService.processBatch(userId, [
      {
        operationId: "bal-income-001",
        entity: "transaction",
        entityId: "bal-income-tx",
        operation: "CREATE",
        payload: {
          id: "bal-income-tx",
          accountId: account.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Income",
        },
      },
    ]);

    // Expense 500
    await syncService.processBatch(userId, [
      {
        operationId: "bal-expense-001",
        entity: "transaction",
        entityId: "bal-expense-tx",
        operation: "CREATE",
        payload: {
          id: "bal-expense-tx",
          accountId: account.id,
          categoryId: expenseCat.id,
          type: "expense",
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-16",
          description: "Expense",
        },
      },
    ]);

    const balance = computeAccountBalance(ctx.db, userId, account.id);
    expect(balance).toBe(50000); // 100000 - 50000 = 50000 (500.00 EGP)
  });

  /* ── 4. Monthly analytics ───────────────────────────────── */
  it("monthly analytics reports signed income and negative expenses", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-monthly@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);

    await syncService.processBatch(userId, [
      {
        operationId: "monthly-income-001",
        entity: "transaction",
        entityId: "monthly-income-tx",
        operation: "CREATE",
        payload: {
          id: "monthly-income-tx",
          accountId: account.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Income",
        },
      },
      {
        operationId: "monthly-expense-001",
        entity: "transaction",
        entityId: "monthly-expense-tx",
        operation: "CREATE",
        payload: {
          id: "monthly-expense-tx",
          accountId: account.id,
          categoryId: expenseCat.id,
          type: "expense",
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-16",
          description: "Expense",
        },
      },
    ]);

    const analyticsRes = await app.inject({
      method: "GET",
      url: "/api/analytics/monthly-summary?from=2026-08&to=2026-08&currency=EGP",
      headers: auth(accessToken),
    });
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = analyticsRes.json() as Array<{
      month: string;
      incomeMinor: number;
      expensesMinor: number;
      savingsMinor: number;
    }>;
    const aug = analytics.find((m) => m.month === "2026-08");
    expect(aug).toBeDefined();
    expect(aug!.incomeMinor).toBe(100000);
    expect(aug!.expensesMinor).toBe(-50000);
    expect(aug!.savingsMinor).toBe(50000); // 100000 + (-50000) = 50000
  });

  /* ── 5. Net worth ───────────────────────────────────────── */
  it("net worth decreases with expenses and is unchanged by transfers", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-networth@example.com");
    const checking = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const savings = await createAccount(app, accessToken, { name: "Savings", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);

    // Income 1000 to checking
    await syncService.processBatch(userId, [
      {
        operationId: "nw-income-001",
        entity: "transaction",
        entityId: "nw-income-tx",
        operation: "CREATE",
        payload: {
          id: "nw-income-tx",
          accountId: checking.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Income",
        },
      },
    ]);

    // Expense 500 from checking
    await syncService.processBatch(userId, [
      {
        operationId: "nw-expense-001",
        entity: "transaction",
        entityId: "nw-expense-tx",
        operation: "CREATE",
        payload: {
          id: "nw-expense-tx",
          accountId: checking.id,
          categoryId: expenseCat.id,
          type: "expense",
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-16",
          description: "Expense",
        },
      },
    ]);

    // Net worth before transfer
    const balancesBefore = computeAccountBalances(ctx.db, userId);
    const netWorthBefore = balancesBefore.reduce((sum, b) => sum + b.balanceMinor, 0);
    expect(netWorthBefore).toBe(50000); // 100000 - 50000 = 50000

    // Transfer 200 from checking to savings
    const transferId = "nw-transfer-001";
    await syncService.processBatch(userId, [
      {
        operationId: "nw-transfer-001",
        entity: "transfer",
        entityId: transferId,
        operation: "CREATE",
        payload: {
          id: transferId,
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 20000,
          currency: "EGP",
          date: "2026-08-17",
          notes: null,
          fromTransactionId: null,
          toTransactionId: null,
          reversedAt: null,
          createdAt: "2026-08-17T10:00:00.000Z",
        },
      },
      {
        operationId: "nw-transfer-from-001",
        entity: "transaction",
        entityId: "nw-leg-from",
        operation: "CREATE",
        payload: {
          id: "nw-leg-from",
          accountId: checking.id,
          categoryId: null,
          type: "transfer",
          amountMinor: 20000,
          currency: "EGP",
          date: "2026-08-17",
          description: "Transfer out",
          reversalOfId: null,
          reversedAt: null,
          transferId,
          createdAt: "2026-08-17T10:00:00.000Z",
        },
      },
      {
        operationId: "nw-transfer-to-001",
        entity: "transaction",
        entityId: "nw-leg-to",
        operation: "CREATE",
        payload: {
          id: "nw-leg-to",
          accountId: savings.id,
          categoryId: null,
          type: "transfer",
          amountMinor: 20000,
          currency: "EGP",
          date: "2026-08-17",
          description: "Transfer in",
          reverseOfId: null,
          reversedAt: null,
          transferId,
          createdAt: "2026-08-17T10:00:00.000Z",
        },
      },
    ]);

    const balancesAfter = computeAccountBalances(ctx.db, userId);
    const netWorthAfter = balancesAfter.reduce((sum, b) => sum + b.balanceMinor, 0);

    // Net worth should be unchanged by a transfer
    expect(netWorthAfter).toBe(netWorthBefore);

    // But individual account balances should reflect the transfer
    const checkingBalance = balancesAfter.find((b) => b.accountId === checking.id)!.balanceMinor;
    const savingsBalance = balancesAfter.find((b) => b.accountId === savings.id)!.balanceMinor;
    expect(checkingBalance).toBe(50000 - 20000); // 30000
    expect(savingsBalance).toBe(20000);
  });

  /* ── 6. Transfer leg signing ───────────────────────────── */
  it("transfer creates correctly signed legs (from negative, to positive)", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-transfer@example.com");
    const fromAccount = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "1000.00" });
    const toAccount = await createAccount(app, accessToken, { name: "Savings", currency: "EGP", openingBalance: "0" });

    const syncService = makeSyncService(ctx);

    const transferId = "transfer-sign-001";
    await syncService.processBatch(userId, [
      {
        operationId: "transfer-sign-001",
        entity: "transfer",
        entityId: transferId,
        operation: "CREATE",
        payload: {
          id: transferId,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-15",
          notes: null,
          fromTransactionId: null,
          toTransactionId: null,
          reversedAt: null,
          createdAt: "2026-08-15T10:00:00.000Z",
        },
      },
      {
        operationId: "transfer-leg-from-001",
        entity: "transaction",
        entityId: "transfer-leg-from",
        operation: "CREATE",
        payload: {
          id: "transfer-leg-from",
          accountId: fromAccount.id,
          categoryId: null,
          type: "transfer",
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Transfer out",
          reversalOfId: null,
          reversedAt: null,
          transferId,
          createdAt: "2026-08-15T10:00:00.000Z",
        },
      },
      {
        operationId: "transfer-leg-to-001",
        entity: "transaction",
        entityId: "transfer-leg-to",
        operation: "CREATE",
        payload: {
          id: "transfer-leg-to",
          accountId: toAccount.id,
          categoryId: null,
          type: "transfer",
          amountMinor: 50000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Transfer in",
          reversalOfId: null,
          reversedAt: null,
          transferId,
          createdAt: "2026-08-15T10:00:00.000Z",
        },
      },
    ]);

    const fromLeg = await ctx.db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, "transfer-leg-from"))
      .get();
    const toLeg = await ctx.db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, "transfer-leg-to"))
      .get();

    expect(fromLeg!.amountMinor).toBe(-50000); // negative (from)
    expect(toLeg!.amountMinor).toBe(50000); // positive (to)

    // Net worth should be unchanged (transfer legs sum to zero)
    const balances = computeAccountBalances(ctx.db, userId);
    expect(balances).toHaveLength(2);
    // Opening balances: 100000 + 0 = 100000. Transfer nets to zero.
    const netWorth = balances.reduce((sum, b) => sum + b.balanceMinor, 0);
    expect(netWorth).toBe(100000); // unchanged
  });

  /* ── 7. Reversal ────────────────────────────────────────── */
  it("reversing a transaction restores the correct financial effect", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-reverse@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, accessToken, { name: "Salary", type: "income" });

    const syncService = makeSyncService(ctx);

    // Create income of 1000
    await syncService.processBatch(userId, [
      {
        operationId: "rev-income-001",
        entity: "transaction",
        entityId: "rev-income-tx",
        operation: "CREATE",
        payload: {
          id: "rev-income-tx",
          accountId: account.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Income",
        },
      },
    ]);

    // Balance should be +100000
    let balance = computeAccountBalance(ctx.db, userId, account.id);
    expect(balance).toBe(100000);

    // Reverse it — the reversal should have amountMinor = -100000 (flipped from +100000)
    await syncService.processBatch(userId, [
      {
        operationId: "rev-reverse-001",
        entity: "transaction",
        entityId: "rev-reversal-tx",
        operation: "CREATE",
        payload: {
          id: "rev-reversal-tx",
          accountId: account.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000, // frontend stores unsigned
          currency: "EGP",
          date: "2026-08-16",
          description: "Reversal",
          reversalOfId: "rev-income-tx",
          reversedAt: null,
          transferId: null,
          createdAt: "2026-08-16T10:00:00.000Z",
        },
      },
    ]);

    // The reversal should be stored with flipped sign (-100000)
    const reversal = await ctx.db
      .select({ amountMinor: transactions.amountMinor, reversalOfId: transactions.reversalOfId })
      .from(transactions)
      .where(eq(transactions.id, "rev-reversal-tx"))
      .get();
    expect(reversal).toBeDefined();
    expect(reversal!.amountMinor).toBe(-100000); // flipped from +100000

    // Balance should be zero (100000 + (-100000) = 0)
    balance = computeAccountBalance(ctx.db, userId, account.id);
    expect(balance).toBe(0);
  });

  /* ── 8. Duplicate sync (idempotency) ───────────────────── */
  it("duplicate operation creates only one record after sign fix", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-idem@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);

    const op: SyncOperationInput = {
      operationId: "idem-expense-001",
      entity: "transaction",
      entityId: "idem-expense-tx",
      operation: "CREATE",
      payload: {
        id: "idem-expense-tx",
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amountMinor: 25000,
        currency: "EGP",
        date: "2026-08-15",
        description: "Idempotency",
      },
    };

    const results1 = await syncService.processBatch(userId, [op]);
    const results2 = await syncService.processBatch(userId, [op]);

    expect(results1[0]?.status).toBe("SUCCESS");
    expect(results2[0]?.status).toBe("DUPLICATE");

    const all = await ctx.db
      .select({ id: transactions.id, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, "idem-expense-tx"))
      .all();
    expect(all).toHaveLength(1);
    expect(all[0]!.amountMinor).toBe(-25000); // signed correctly, only one record
  });

  /* ── 9. Cross-user ownership ────────────────────────────── */
  it("user A cannot mutate user B's financial records via sync", async () => {
    const { accessToken: tokenA, userId: userA } = await signupUser(app, "inv-userA@example.com");
    const { accessToken: tokenB, userId: userB } = await signupUser(app, "inv-userB@example.com");

    const accountA = await createAccount(app, tokenA, { name: "UserA Account", currency: "EGP", openingBalance: "0" });
    const accountB = await createAccount(app, tokenB, { name: "UserB Account", currency: "EGP", openingBalance: "0" });
    const incomeCat = await createCategory(app, tokenA, { name: "Salary", type: "income" });

    const syncService = makeSyncService(ctx);

    // User A creates a transaction on their account
    await syncService.processBatch(userA, [
      {
        operationId: "owner-a-001",
        entity: "transaction",
        entityId: "owner-a-tx",
        operation: "CREATE",
        payload: {
          id: "owner-a-tx",
          accountId: accountA.id,
          categoryId: incomeCat.id,
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "User A income",
        },
      },
    ]);

    // User A tries to CREATE a transaction on user B's account via sync
    await syncService.processBatch(userA, [
      {
        operationId: "owner-b-001",
        entity: "transaction",
        entityId: "owner-b-tx",
        operation: "CREATE",
        payload: {
          id: "owner-b-tx",
          accountId: accountB.id, // User B's account!
          categoryId: incomeCat.id, // User A's category
          type: "income",
          amountMinor: 100000,
          currency: "EGP",
          date: "2026-08-15",
          description: "Should fail",
        },
      },
    ]);

    // User B's account should have zero transactions
    const bTxs = await ctx.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountB.id))
      .all();
    expect(bTxs).toHaveLength(0);

    // User A's account should have one transaction
    const aTxs = await ctx.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountA.id))
      .all();
    expect(aTxs).toHaveLength(1);
    expect(aTxs[0]!.userId).toBe(userA);

    // User A's balance should be 100000
    const balanceA = computeAccountBalance(ctx.db, userA, accountA.id);
    expect(balanceA).toBe(100000);
  });

  /* ── 10. Idempotency remains correct after sign fix ────── */
  it("duplicate of a signed operation returns DUPLICATE and preserves sign", async () => {
    const { accessToken, userId } = await signupUser(app, "inv-idem2@example.com");
    const account = await createAccount(app, accessToken, { name: "Checking", currency: "EGP", openingBalance: "0" });
    const expenseCat = await createCategory(app, accessToken, { name: "Food", type: "expense" });

    const syncService = makeSyncService(ctx);

    const op: SyncOperationInput = {
      operationId: "idem2-expense-001",
      entity: "transaction",
      entityId: "idem2-expense-tx",
      operation: "CREATE",
      payload: {
        id: "idem2-expense-tx",
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amountMinor: 75000,
        currency: "EGP",
        date: "2026-08-15",
        description: "Idempotency 2",
      },
    };

    await syncService.processBatch(userId, [op]);
    const results = await syncService.processBatch(userId, [op]);

    expect(results[0]?.status).toBe("DUPLICATE");

    const tx = await ctx.db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, "idem2-expense-tx"))
      .get();
    expect(tx!.amountMinor).toBe(-75000); // signed correctly, unchanged
  });
});
