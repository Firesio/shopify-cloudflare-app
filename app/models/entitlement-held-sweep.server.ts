import { asc, lte, sql } from "drizzle-orm";
import { entitlementAllocations, entitlementOperations } from "~/db/schema";
import type { HeldItem } from "~/ports/entitlement-reconciliation";
import { getDb } from "~/request-context.server";

// The state is the literal 'held', not a bound parameter: SQLite uses a partial index only when the query's WHERE
// repeats the index's own condition, and a `?` does not count.
export function expiredQuotaQuery(createdAtOrBefore: number, limit: number) {
  return getDb()
    .select({
      shop: entitlementOperations.shop,
      key: entitlementOperations.key,
      operationId: entitlementOperations.operationId,
      period: entitlementOperations.period,
      amount: entitlementOperations.reservedAmount,
      createdAt: entitlementOperations.createdAt,
    })
    .from(entitlementOperations)
    .where(sql`${entitlementOperations.state} = 'held' and ${lte(entitlementOperations.createdAt, createdAtOrBefore)}`)
    .orderBy(asc(entitlementOperations.createdAt))
    .limit(limit);
}

export function expiredCapacityQuery(createdAtOrBefore: number, limit: number) {
  return getDb()
    .select({
      shop: entitlementAllocations.shop,
      key: entitlementAllocations.key,
      allocationId: entitlementAllocations.allocationId,
      operationId: entitlementAllocations.operationId,
      createdAt: entitlementAllocations.createdAt,
    })
    .from(entitlementAllocations)
    .where(sql`${entitlementAllocations.state} = 'held' and ${lte(entitlementAllocations.createdAt, createdAtOrBefore)}`)
    .orderBy(asc(entitlementAllocations.createdAt))
    .limit(limit);
}

function compareHeld(left: HeldItem, right: HeldItem): number {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  if (left.kind !== right.kind) return left.kind === "quota" ? -1 : 1;
  const keyOrder = left.key.localeCompare(right.key);
  return keyOrder !== 0 ? keyOrder : left.id.localeCompare(right.id);
}

/**
 * Held quota reservations and capacity allocations of EVERY shop, for the cron sweep that settles the ones a crashed
 * run left behind. Reads only; settling one goes through `EntitlementRepo.applyReconciliation`, which is shop-scoped.
 */
export class HeldSweepRepo {
  /** Up to `limit` held items created at or before `createdAtOrBefore`, oldest first. */
  async listExpired(createdAtOrBefore: number, limit: number): Promise<readonly HeldItem[]> {
    if (limit <= 0) return [];
    const [quota, capacity] = await getDb().batch([
      expiredQuotaQuery(createdAtOrBefore, limit),
      expiredCapacityQuery(createdAtOrBefore, limit),
    ]);
    const items: HeldItem[] = [
      ...quota.map((row): HeldItem => ({ kind: "quota", shop: row.shop, key: row.key, id: row.operationId, period: row.period, amount: row.amount, createdAt: row.createdAt })),
      ...capacity.map((row): HeldItem => ({ kind: "capacity", shop: row.shop, key: row.key, id: row.allocationId, operationId: row.operationId, createdAt: row.createdAt })),
    ];
    return items.sort(compareHeld).slice(0, limit);
  }
}
