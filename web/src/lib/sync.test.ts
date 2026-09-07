/**
 * Frontend sync engine tests — Phase 9.1
 *
 * Tests the real frontend sync pipeline:
 *   Dexie write → enqueueSync → flushSyncQueue → HTTP /api/sync → SYNCED
 *
 * Uses a mock fetch that simulates the backend's response contract.
 * Tests state transitions: PENDING → SYNCING → SYNCED / FAILED → retry → SUCCESS / DUPLICATE.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { enqueueSync, flushSyncQueue, getSyncStatus, toSyncPayload, type SyncEntityType } from "./sync";

const TOKEN_KEY = "moneyos.accessToken";

describe("Phase 9.1: Frontend Sync Engine", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Use "local" token so enqueueSync's implicit flushSyncQueue early-returns
    localStorage.setItem(TOKEN_KEY, "local");
    if (!db.isOpen) {
      await db.open();
    }
    // Start offline
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    global.fetch = vi.fn();
  });

  afterEach(async () => {
    await db.syncQueue.clear();
    await db.transactions.clear();
    await db.accounts.clear();
    await db.categories.clear();
    await db.budgets.clear();
    await db.savingsGoals.clear();
    await db.savingsContributions.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function mockBackendSuccess(operations: { operationId: string }[]): Response {
    const results = operations.map((op) => ({
      operationId: op.operationId,
      entity: "transaction",
      entityId: "test",
      status: "SUCCESS" as const,
    }));
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  function mockBackendDuplicate(operations: { operationId: string }[]): Response {
    const results = operations.map((op) => ({
      operationId: op.operationId,
      entity: "transaction",
      entityId: "test",
      status: "DUPLICATE" as const,
    }));
    return new Response(JSON.stringify(results), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  function mockBackendConflict(operations: { operationId: string }[]): Response {
    const results = operations.map((op) => ({
      operationId: op.operationId,
      entity: "transaction",
      entityId: "test",
      status: "CONFLICT" as const,
      error: "Temporary conflict",
    }));
    return new Response(JSON.stringify(results), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  function mockBackendPermanentError(operations: { operationId: string }[]): Response {
    const results = operations.map((op) => ({
      operationId: op.operationId,
      entity: "transaction",
      entityId: "test",
      status: "PERMANENT_ERROR" as const,
      error: "Validation error",
    }));
    return new Response(JSON.stringify(results), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  function goOnline() {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  }

  /* ── 1. Dexie write → queue → flush → SYNCED ────────────────── */
  it("full pipeline: local write → queue → flushSyncQueue → SYNCED", async () => {
    // enqueueSync is offline (set in beforeEach)
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-local-001",
      "CREATE",
      toSyncPayload({
        id: "tx-local-001",
        userId: "should-be-stripped",
        type: "income",
        amountMinor: 100000,
        currency: "EGP",
      }),
    );

    // Verify PENDING
    const pending = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe("PENDING");
    expect(pending[0]!.payload).not.toHaveProperty("userId");

    // Go online + set real JWT token + mock fetch
    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    mockFetch = vi.fn().mockResolvedValue(mockBackendSuccess(pending));
    global.fetch = mockFetch as unknown as typeof fetch;

    await flushSyncQueue();

    const synced = await db.syncQueue.get(pending[0]!.operationId);
    expect(synced!.status).toBe("SYNCED");
    expect(synced!.retryCount).toBe(0);
    expect(synced!.lastError).toBe(null);
    expect(synced!.nextRetryAt).toBe(null);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/sync");
    const body = JSON.parse(call[1]!.body as string);
    expect(body.operations).toHaveLength(1);
    expect(body.operations[0]!.entity).toBe("transaction");
    expect(body.operations[0]!.operation).toBe("CREATE");
  });

  /* ── 2. FAILED → retry → SUCCESS ─────────────────────────── */
  it("retry flow: CONFLICT → FAILED with backoff → retry → SUCCESS", async () => {
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-retry-001",
      "CREATE",
      toSyncPayload({ id: "tx-retry-001", type: "income", amountMinor: 50000, currency: "EGP" }),
    );

    const ops = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    const opId = ops[0]!.operationId;

    let attemptCount = 0;
    mockFetch = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) return Promise.resolve(mockBackendConflict([{ operationId: opId }]));
      return Promise.resolve(mockBackendSuccess([{ operationId: opId }]));
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    await flushSyncQueue();

    const failed = await db.syncQueue.get(opId);
    expect(failed!.status).toBe("FAILED");
    expect(failed!.retryCount).toBe(1);
    expect(failed!.nextRetryAt).not.toBe(null);
    expect(failed!.lastError).toContain("conflict");

    // Verify backoff delay is ~2s (backoffDelay(1) = 1000 * 2^1 = 2000)
    const retryDate = new Date(failed!.nextRetryAt!);
    const diffMs = retryDate.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(1900);
    expect(diffMs).toBeLessThan(2100);

    // Retry — go online and flush again
    await db.syncQueue.update(opId, { nextRetryAt: null });
    await flushSyncQueue();

    const synced = await db.syncQueue.get(opId);
    expect(synced!.status).toBe("SYNCED");
    expect(synced!.retryCount).toBe(0);
  });

  /* ── 3. Duplicate from backend ──────── */
  it("duplicate from backend transitions to SYNCED", async () => {
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-dupid-001",
      "CREATE",
      toSyncPayload({ id: "tx-dupid-001", type: "expense", amountMinor: 25000, currency: "EGP" }),
    );

    const ops = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    const opId = ops[0]!.operationId;

    mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockBackendDuplicate([{ operationId: opId }])),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    await flushSyncQueue();

    const synced = await db.syncQueue.get(opId);
    expect(synced!.status).toBe("SYNCED");
  });

  /* ── 4. Permanent error ──────── */
  it("PERMANENT_ERROR transitions to FAILED without retry deadline", async () => {
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-perm-001",
      "CREATE",
      toSyncPayload({ id: "tx-perm-001", type: "expense", amountMinor: 25000, currency: "EGP" }),
    );

    const ops = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    const opId = ops[0]!.operationId;

    mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(mockBackendPermanentError([{ operationId: opId }])),
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    await flushSyncQueue();

    const failed = await db.syncQueue.get(opId);
    expect(failed!.status).toBe("FAILED");
    expect(failed!.nextRetryAt).toBe(null);
    expect(failed!.lastError).toContain("Validation error");
  });

  /* ── 5. Network error → backoff ──────── */
  it("network error: FAILED with exponential backoff", async () => {
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-net-001",
      "CREATE",
      toSyncPayload({ id: "tx-net-001", type: "income", amountMinor: 100000, currency: "EGP" }),
    );

    const ops = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    const opId = ops[0]!.operationId;

    mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch as unknown as typeof fetch;

    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    await flushSyncQueue();

    const op = await db.syncQueue.get(opId);
    expect(op!.status).toBe("FAILED");
    expect(op!.retryCount).toBe(1);
    expect(op!.nextRetryAt).not.toBe(null);
    expect(op!.lastError).toBe("Network error");

    const retryDate = new Date(op!.nextRetryAt!);
    const diffMs = retryDate.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(1900);
    expect(diffMs).toBeLessThan(2100);
  });

  /* ── 6. Offline ──────────────────────── */
  it("offline mode: does not attempt network call", async () => {
    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-offline-001",
      "CREATE",
      toSyncPayload({ id: "tx-offline-001", type: "income", amountMinor: 100000, currency: "EGP" }),
    );

    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    // Stay offline — flushSyncQueue should early-return
    await flushSyncQueue();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  /* ── 7. No token ────────────────────── */
  it("no auth token: operations stay PENDING", async () => {
    localStorage.removeItem(TOKEN_KEY);

    await enqueueSync(
      "transaction" as SyncEntityType,
      "tx-notoken-001",
      "CREATE",
      toSyncPayload({ id: "tx-notoken-001", type: "income", amountMinor: 100000, currency: "EGP" }),
    );

    const ops = await db.syncQueue.where("status").anyOf("PENDING", "FAILED").toArray();
    const opId = ops[0]!.operationId;

    // Manually mark as SYNCED (since enqueueSync's implicit flush won't do anything without token)
    // and then verify the operation stays PENDING when we try to flush without token
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    goOnline();
    await flushSyncQueue();

    expect(mockFetch).not.toHaveBeenCalled(); // no token → no fetch

    const op = await db.syncQueue.get(opId);
    expect(op!.status).toBe("PENDING");
  });

  /* ── 8. Sync status counter ──────────────────────────────── */
  it("getSyncStatus returns correct counts", async () => {
    await enqueueSync("account" as SyncEntityType, "acc-001", "CREATE", { id: "acc-001", name: "Test" });
    await enqueueSync("account" as SyncEntityType, "acc-002", "CREATE", { id: "acc-002", name: "Test" });

    const all = await db.syncQueue.toArray();
    await db.syncQueue.update(all[0]!.operationId, { status: "SYNCED" });

    const status = await getSyncStatus();
    expect(status.pending).toBe(1);
    expect(status.synced).toBe(1);
    expect(status.failed).toBe(0);
  });

  /* ── 9. Batch processing ─────────────────────────────────── */
  it("batch of operations all succeed", async () => {
    await enqueueSync("account" as SyncEntityType, "b-acc-001", "CREATE", { id: "b-acc-001", name: "A" });
    await enqueueSync("account" as SyncEntityType, "b-acc-002", "CREATE", { id: "b-acc-002", name: "B" });
    await enqueueSync("account" as SyncEntityType, "b-acc-003", "CREATE", { id: "b-acc-003", name: "C" });

    const all = await db.syncQueue.toArray();

    mockFetch = vi.fn().mockImplementation(() => Promise.resolve(mockBackendSuccess(all)));
    global.fetch = mockFetch as unknown as typeof fetch;

    localStorage.setItem(TOKEN_KEY, "eyJfake.token");
    goOnline();
    await flushSyncQueue();

    const status = await getSyncStatus();
    expect(status.synced).toBe(3);
    expect(status.pending).toBe(0);
    expect(status.failed).toBe(0);
  });
});

/* ── Pure function tests (no DB) ──────────────────────────────────────────── */
describe("Phase 9.1: Frontend Sync Engine (pure functions)", () => {
  it("toSyncPayload strips userId and preserves financial fields", () => {
    const record = {
      id: "test-001",
      userId: "user-123",
      type: "income",
      amountMinor: 100000,
      currency: "EGP",
      accountId: "acc-001",
      categoryId: "cat-001",
      date: "2026-08-15",
      description: "Test transaction",
    };
    const payload = toSyncPayload(record);

    expect(payload).not.toHaveProperty("userId");
    expect(payload.id).toBe("test-001");
    expect(payload.accountId).toBe("acc-001");
    expect(payload.type).toBe("income");
    expect(payload.amountMinor).toBe(100000);
    expect(payload.currency).toBe("EGP");
  });

  it("toSyncPayload handles missing optional fields", () => {
    const record = {
      id: "test-002",
      type: "expense",
      amountMinor: 50000,
      currency: "EGP",
    };
    const payload = toSyncPayload(record);

    expect(payload).not.toHaveProperty("userId");
    expect(payload.id).toBe("test-002");
    expect(payload.type).toBe("expense");
    expect(payload.amountMinor).toBe(50000);
  });
});
