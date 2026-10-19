import { and, inArray, lt } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  aiRuns,
  mcpAuditLogs,
  notificationLogs,
  staffAuditLogs,
  webhookDeliveries,
  webhookScopeObservations,
} from "~/db/schema";
import type { RetentionTarget } from "~/domain/retention";
import type { RetentionStore } from "~/ports/retention";
import { getDb } from "~/request-context.server";

type Prune = (cutoff: number, limit: number) => Promise<number>;

/**
 * One bounded delete per target. Each selects the oldest expired ids through an
 * index on the time column (no bound parameter per id: D1 caps those at 100) and
 * deletes exactly those, so one call never holds D1, which runs one query at a
 * time, for longer than a batch.
 */
const PRUNERS: Readonly<Record<RetentionTarget, Prune>> = {
  webhook_deliveries_processed: (cutoff, limit) => pruneDeliveries(["processed"], cutoff, limit),
  webhook_deliveries_failed: (cutoff, limit) => pruneDeliveries(["failed", "dead_letter"], cutoff, limit),
  notification_logs: (cutoff, limit) => pruneByAge(notificationLogs, notificationLogs.id, notificationLogs.createdAt, cutoff, limit),
  ai_runs: (cutoff, limit) => pruneByAge(aiRuns, aiRuns.id, aiRuns.createdAt, cutoff, limit),
  mcp_audit_logs: (cutoff, limit) => pruneByAge(mcpAuditLogs, mcpAuditLogs.id, mcpAuditLogs.createdAt, cutoff, limit),
  staff_audit_logs: (cutoff, limit) => pruneByAge(staffAuditLogs, staffAuditLogs.id, staffAuditLogs.createdAt, cutoff, limit),
};

/** The oldest `limit` rows whose `at` is before `cutoff`, deleted by id. */
async function pruneByAge(
  table: SQLiteTable,
  id: AnySQLiteColumn,
  at: AnySQLiteColumn,
  cutoff: number,
  limit: number,
): Promise<number> {
  const db = getDb();
  const expired = db.select({ id }).from(table).where(lt(at, cutoff)).orderBy(at).limit(limit);
  const result = await db.delete(table).where(inArray(id, expired));
  return result.meta.changes;
}

/**
 * Settled deliveries only. A delivery still `received`, `queued` or `processing`
 * is in flight (or stuck, which staff must see), so age alone never removes it.
 * Its scope observations go in the same transaction, ahead of the parent.
 */
async function pruneDeliveries(
  statuses: readonly ("processed" | "failed" | "dead_letter")[],
  cutoff: number,
  limit: number,
): Promise<number> {
  const db = getDb();
  const expired = db.select({ id: webhookDeliveries.id }).from(webhookDeliveries)
    .where(and(inArray(webhookDeliveries.status, [...statuses]), lt(webhookDeliveries.receivedAt, cutoff)))
    .orderBy(webhookDeliveries.receivedAt).limit(limit);
  const [, deleted] = await db.batch([
    db.delete(webhookScopeObservations).where(inArray(webhookScopeObservations.deliveryId, expired)),
    db.delete(webhookDeliveries).where(inArray(webhookDeliveries.id, expired)),
  ]);
  return deleted.meta.changes;
}

/** The only place retention deletes run. Not shop-scoped by design: expiry applies to every shop alike. */
export class RetentionRepo implements RetentionStore {
  prune(target: RetentionTarget, cutoff: number, limit: number): Promise<number> {
    return PRUNERS[target](cutoff, limit);
  }
}
