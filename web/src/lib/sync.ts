/**
 * Offline-first data synchronization for MoneyOS.
 *
 * Architecture:
 * - Local-first: all writes go to Dexie immediately (responsive UX).
 * - After each local write, a sync operation is enqueued in the Dexie
 *   `syncQueue` table (persistent across page refreshes / browser restarts).
 * - A background sync engine drains the queue by sending batched operations
 *   to POST /api/sync on the backend.
 * - If the network is down or the JWT is missing, operations stay PENDING
 *   and are retried later (exponential backoff).
 * - Backend enforces idempotency via an Idempotency-Key header containing
 *   the frontend operationId. Duplicate operations are safe — they never
 *   create duplicate financial records.
 * - The backend derives ownership from the authenticated JWT; it never
 *   trusts a client-provided userId.
 *
 * Conflict strategy: last-write-wins using server-updated updated_at
 * timestamps (via ON CONFLICT … DO UPDATE in the backend).
 */
import { db } from "./db";
import type { SyncOperation, SyncPayload } from "./db";

export type SyncEntityType =
  | "account"
  | "transaction"
  | "transfer"
  | "category"
  | "budget"
  | "savingsGoal"
  | "savingsContribution";

export type SyncOperationType = "CREATE" | "UPDATE" | "DELETE";

export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

// ─── Token access (reads localStorage directly — no circular dep on api.ts) ───

/** Reads the access token from localStorage without importing api.ts. */
function getSyncToken(): string | null {
  try {
    return localStorage.getItem("moneyos.accessToken") ?? null;
  } catch {
    return null;
  }
}

// ─── Queue operations ────────────────────────────────────────────────────────

/**
 * Queue a single sync operation. Called by the data-access layer
 * immediately after every successful local write.
 */
export async function enqueueSync(
  entity: SyncEntityType,
  entityId: string,
  operation: SyncOperationType,
  payload: SyncPayload,
): Promise<void> {
  const opId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const op: SyncOperation = {
    operationId: opId,
    entity,
    entityId,
    operation,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "PENDING",
    nextRetryAt: null,
    lastError: null,
  };
  await db.syncQueue.add(op);
  void flushSyncQueue();
}

/**
 * Convert a Dexie entity record to a sync payload (strips userId for security).
 * Type-safe generic helper: accepts any record object that may have a userId field
 * and returns a SyncPayload with userId omitted.
 */
export function toSyncPayload<T extends object>(record: T): SyncPayload {
  const payload: Record<string, unknown> = {};
  for (const key in record) {
    if (key !== "userId") {
      payload[key] = record[key as keyof T];
    }
  }
  return payload;
}

// ─── Retry / backoff ────────────────────────────────────────────────────────

/** Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 60s. */
function backoffDelay(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 60_000);
}

// ─── Backend response contract ──────────────────────────────────────────────

export interface SyncOperationResult {
  operationId: string;
  entity: SyncEntityType;
  entityId: string;
  status: "SUCCESS" | "DUPLICATE" | "PERMANENT_ERROR" | "CONFLICT";
  error?: string;
}

// ─── Sync engine ────────────────────────────────────────────────────────────

/**
 * Drain pending sync operations by sending them to the backend in a batch.
 */
export async function flushSyncQueue(): Promise<void> {
  const token = getSyncToken();
  if (!token || token === "local") {
    // No real JWT — leave operations pending for later.
    return;
  }

  const pending = await db.syncQueue
    .where("status")
    .anyOf("PENDING", "FAILED")
    .and((op) => op.nextRetryAt === null || new Date(op.nextRetryAt) <= new Date())
    .limit(50)
    .toArray();

  if (pending.length === 0) return;

  // Mark as SYNCING to prevent duplicate concurrent processing.
  const ids = pending.map((o) => o.operationId);
  await db.syncQueue.where("operationId").anyOf(ids).modify({ status: "SYNCING", lastError: null });

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ operations: pending }),
    });

    const results = (await res.json()) as SyncOperationResult[];
    await applyResults(pending, results);
  } catch {
    // Network error — leave operations as FAILED with retry deadline.
    for (const op of pending) {
      const retryCount = op.retryCount + 1;
      const delay = backoffDelay(retryCount);
      await db.syncQueue.update(op.operationId, {
        status: "FAILED",
        retryCount,
        nextRetryAt: new Date(Date.now() + delay).toISOString(),
        lastError: "Network error",
      });
    }
  }
}

async function applyResults(
  sent: SyncOperation[],
  results: SyncOperationResult[],
): Promise<void> {
  const byId = new Map(sent.map((o) => [o.operationId, o]));
  const updates: Array<{ key: string; patch: Partial<SyncOperation> }> = [];

  for (const res of results) {
    const original = byId.get(res.operationId);
    if (!original) continue;

    if (res.status === "SUCCESS" || res.status === "DUPLICATE") {
      updates.push({
        key: res.operationId,
        patch: { status: "SYNCED", retryCount: 0, nextRetryAt: null, lastError: null },
      });
    } else if (res.status === "PERMANENT_ERROR") {
      updates.push({
        key: res.operationId,
        patch: {
          status: "FAILED",
          retryCount: original.retryCount + 1,
          nextRetryAt: null, // don't retry permanent errors
          lastError: res.error ?? "Permanent error",
        },
      });
    } else {
      // CONFLICT or retryable — keep as FAILED with backoff
      const retryCount = original.retryCount + 1;
      const delay = backoffDelay(retryCount);
      updates.push({
        key: res.operationId,
        patch: {
          status: "FAILED",
          retryCount,
          nextRetryAt: new Date(Date.now() + delay).toISOString(),
          lastError: res.error ?? "Conflict",
        },
      });
    }
  }

  for (const { key, patch } of updates) {
    await db.syncQueue.update(key, patch);
  }
}

/**
 * Returns the number of pending/failed sync operations.
 * The UI can use this for a simple sync-status indicator.
 */
export async function getSyncStatus(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}> {
  const all = await db.syncQueue.toArray();
  const counts = { pending: 0, syncing: 0, synced: 0, failed: 0 };
  for (const op of all) {
    if (op.status === "PENDING") counts.pending++;
    else if (op.status === "SYNCING") counts.syncing++;
    else if (op.status === "SYNCED") counts.synced++;
    else counts.failed++;
  }
  return counts;
}

/**
 * Periodically drain the queue (every 5 seconds while the tab is active).
 */
export function startSyncEngine(intervalMs = 5000): (() => void)[] {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await flushSyncQueue();
    } catch {
      // swallow — errors are tracked per-operation
    } finally {
      running = false;
    }
  };

  const tickHandler = () => void tick();
  timer = setInterval(tickHandler, intervalMs);
  window.addEventListener("focus", tickHandler);
  window.addEventListener("online", tickHandler);

  const stop = () => {
    if (timer) clearInterval(timer);
    window.removeEventListener("focus", tickHandler);
    window.removeEventListener("online", tickHandler);
  };

  return [stop];
}
