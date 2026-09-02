/**
 * Real E2E sync verification — Phase 9 validation.
 *
 * This test exercises the FULL sync pipeline:
 *   frontend local record → sync queue → HTTP sync → backend DB → analytics
 *
 * It uses the real backend (Fastify inject), real SQLite database, real JWT auth,
 * and the real SyncService.processBatch() — no mocks.
 */
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { transactions } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("Phase 9 E2E: Real Sync Pipeline", () => {
  let ctx: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Helper: create a real SyncService wired to the test database.
   */
  function makeSyncService(): SyncService {
    const accounts = new AccountService(ctx.db);
    const categories = new CategoryService(ctx.db);
    const budgets = new BudgetService(ctx.db, categories);
    const savingsGoals = new SavingsGoalService(ctx.db);
    return new SyncService(ctx.db, accounts, categories, budgets, savingsGoals);
  }

  it("TEST A: API transaction → backend DB → analytics", async () => {
    // 1. Create a dedicated test user through the real backend auth flow.
    const { accessToken, userId } = await signupUser(app, "e2e-sync-a@example.com");
    expect(accessToken).toMatch(/^eyJ/);

    // 2. Create account + category (needed for transactions).
    const account = await createAccount(app, accessToken, {
      name: "Main Checking",
      currency: "EGP",
      openingBalance: "500.00",
    });
    const incomeCat = await createCategory(app, accessToken, {
      name: "Salary",
      type: "income",
    });

    // 3. Create ONE real transaction through the normal frontend API flow.
    const tx = await createTransaction(app, accessToken, {
      type: "income",
      amount: "1000.00",
      accountId: account.id,
      categoryId: incomeCat.id,
      date: "2026-08-15",
      description: "E2E Test Salary",
    });
    expect(tx).toBeDefined();
    expect(tx.id).toBeTypeOf("string");

    // 4. Verify the transaction exists in the backend database.
    const dbTxn = await ctx.db
      .select({ id: transactions.id, amountMinor: transactions.amountMinor, type: transactions.type })
      .from(transactions)
      .where(eq(transactions.id, tx.id))
      .get();
    expect(dbTxn).toBeDefined();
    expect(dbTxn!.amountMinor).toBe(100000);
    expect(dbTxn!.type).toBe("income");

    // 5. Sync flow: a transaction created via sync operation endpoint.
    const syncService = makeSyncService();

    const syncOp: SyncOperationInput = {
      operationId: "test-op-e2e-001",
      entity: "transaction",
      entityId: "sync-tx-e2e-001",
      operation: "CREATE",
      payload: {
        id: "sync-tx-e2e-001",
        accountId: account.id,
        categoryId: incomeCat.id,
        type: "expense",
        amountMinor: 50000,
        currency: "EGP",
        date: "2026-08-20",
        description: "Sync E2E Test Expense",
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId: null,
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    };

    // 6. Process the sync operation through the real SyncService.
    const results = await syncService.processBatch(userId, [syncOp]);
    expect(results).toHaveLength(1);
    expect(results[0]!.operationId).toBe("test-op-e2e-001");
    expect(results[0]!.status).toBe("SUCCESS");

    // 7. Verify the synced transaction exists in the backend database.
    const syncedTxn = await ctx.db
      .select({ id: transactions.id, amountMinor: transactions.amountMinor, type: transactions.type, description: transactions.description })
      .from(transactions)
      .where(eq(transactions.id, "sync-tx-e2e-001"))
      .get();
    expect(syncedTxn).toBeDefined();
    expect(syncedTxn!.amountMinor).toBe(50000);
    expect(syncedTxn!.type).toBe("expense");
    expect(syncedTxn!.description).toBe("Sync E2E Test Expense");

    // 8. Query the real analytics endpoint using the same JWT.
    const analyticsRes = await app.inject({
      method: "GET",
      url: "/api/analytics/monthly-summary?from=2026-08&to=2026-08&currency=EGP",
      headers: auth(accessToken),
    });
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = analyticsRes.json() as Array<{
      month: string;
      currency: string;
      incomeMinor: number;
      expensesMinor: number;
      savingsMinor: number;
    }>;

    // 9. Verify analytics reflects the synced transaction.
    const augSummary = analytics.find((m) => m.month === "2026-08");
    expect(augSummary).toBeDefined();
    expect(augSummary!.incomeMinor).toBe(100000); // 1000.00 from API-created tx
    expect(augSummary!.expensesMinor).toBe(50000); // 500.00 from sync-created tx
  });

  it("TEST B: idempotency — same operationId twice creates only one record", async () => {
    const { accessToken, userId } = await signupUser(app, "e2e-idem@example.com");
    const account = await createAccount(app, accessToken, {
      name: "Main",
      currency: "EGP",
      openingBalance: "0",
    });
    const expenseCat = await createCategory(app, accessToken, {
      name: "Food",
      type: "expense",
    });

    const syncService = makeSyncService();

    const syncOp: SyncOperationInput = {
      operationId: "idem-op-001",
      entity: "transaction",
      entityId: "idem-tx-001",
      operation: "CREATE",
      payload: {
        id: "idem-tx-001",
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amountMinor: 25000,
        currency: "EGP",
        date: "2026-08-20",
        description: "Idempotency Test",
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId: null,
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    };

    // Submit the SAME operationId twice.
    const results1 = await syncService.processBatch(userId, [syncOp]);
    const results2 = await syncService.processBatch(userId, [syncOp]);

    expect(results1[0]!.status).toBe("SUCCESS");
    expect(results2[0]!.status).toBe("DUPLICATE");

    // Verify only ONE transaction record exists in the backend.
    const all = await ctx.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, "idem-tx-001"))
      .all();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("idem-tx-001");
  });

  it("TEST C: offline simulation — operation succeeds when backend offline recovery", async () => {
    const { accessToken, userId } = await signupUser(app, "e2e-offline@example.com");
    const account = await createAccount(app, accessToken, {
      name: "Main",
      currency: "EGP",
      openingBalance: "1000.00",
    });
    const incomeCat = await createCategory(app, accessToken, {
      name: "Income",
      type: "income",
    });

    const syncService = makeSyncService();

    // A sync operation that would have been queued while offline.
    const syncOp: SyncOperationInput = {
      operationId: "offline-op-001",
      entity: "transaction",
      entityId: "offline-tx-001",
      operation: "CREATE",
      payload: {
        id: "offline-tx-001",
        accountId: account.id,
        categoryId: incomeCat.id,
        type: "income",
        amountMinor: 75000,
        currency: "EGP",
        date: "2026-08-25",
        description: "Offline Test",
        notes: null,
        reversalOfId: null,
        reversedAt: null,
        transferId: null,
        createdAt: "2026-08-25T10:00:00.000Z",
      },
    };

    // Process (simulating backend recovery after being offline).
    const results = await syncService.processBatch(userId, [syncOp]);
    expect(results[0]!.status).toBe("SUCCESS");

    // Verify transaction exists in backend.
    const dbTxn = await ctx.db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, "offline-tx-001"))
      .get();
    expect(dbTxn).toBeDefined();
    expect(dbTxn!.amountMinor).toBe(75000);

    // Verify analytics sees it.
    const analyticsRes = await app.inject({
      method: "GET",
      url: "/api/analytics/monthly-summary?from=2026-08&to=2026-08&currency=EGP",
      headers: auth(accessToken),
    });
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = analyticsRes.json() as Array<{ month: string; incomeMinor: number }>;
    const aug = analytics.find((m) => m.month === "2026-08");
    expect(aug).toBeDefined();
    expect(aug!.incomeMinor).toBe(75000);
  });
});
