import { applySubscriptionObservation, isSubscriptionStatus, type PlanGrantStore, type StoredPlanGrant, type SubscriptionProjection, type SubscriptionStore } from "@firesio/plans/billing";

const READ = `SELECT status, plan_handle, trial_ends_at, current_period_ends_at, cancellation_effective_at, applied_occurred_at, applied_external_id FROM shop_subscriptions WHERE shop = ?1`;

/** One conditional statement: the row is replaced only by an observation that sorts after the stored one (time, then id). */
const UPSERT = `INSERT INTO shop_subscriptions (shop, status, plan_handle, trial_ends_at, current_period_ends_at, cancellation_effective_at, applied_occurred_at, applied_external_id, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
ON CONFLICT (shop) DO UPDATE SET status = excluded.status, plan_handle = excluded.plan_handle, trial_ends_at = excluded.trial_ends_at,
  current_period_ends_at = excluded.current_period_ends_at, cancellation_effective_at = excluded.cancellation_effective_at,
  applied_occurred_at = excluded.applied_occurred_at, applied_external_id = excluded.applied_external_id, updated_at = excluded.updated_at
WHERE shop_subscriptions.applied_occurred_at < excluded.applied_occurred_at
   OR (shop_subscriptions.applied_occurred_at = excluded.applied_occurred_at AND shop_subscriptions.applied_external_id < excluded.applied_external_id)`;

const num = (row: Record<string, unknown>, key: string): number | null => (typeof row[key] === "number" ? row[key] : null);

function projectionOf(row: Record<string, unknown>): SubscriptionProjection | null {
  const status = row["status"];
  const external = row["applied_external_id"];
  const occurred = num(row, "applied_occurred_at");
  if (typeof status !== "string" || !isSubscriptionStatus(status) || typeof external !== "string" || occurred === null) return null;
  const handle = row["plan_handle"];
  return {
    status,
    planHandle: typeof handle === "string" ? handle : null,
    trialEndsAt: num(row, "trial_ends_at"),
    currentPeriodEndsAt: num(row, "current_period_ends_at"),
    cancellationEffectiveAt: num(row, "cancellation_effective_at"),
    appliedOccurredAt: occurred,
    appliedExternalId: external,
  };
}

/** The subscription projection (`SubscriptionStore`): one row per shop, ordered by the library's rule, written by one statement. */
export function d1SubscriptionStore(db: D1Database, now: () => number): SubscriptionStore {
  const read = async (shop: string) => {
    const row = await db.prepare(READ).bind(shop).first();
    return row === null ? null : projectionOf(row);
  };
  return {
    read,
    async upsert(shop, observation) {
      const decided = applySubscriptionObservation(await read(shop), observation);
      if (decided.kind !== "applied") return decided.kind;
      const n = decided.next;
      const written = await db
        .prepare(UPSERT)
        .bind(shop, n.status, n.planHandle, n.trialEndsAt, n.currentPeriodEndsAt, n.cancellationEffectiveAt, n.appliedOccurredAt, n.appliedExternalId, now())
        .run();
      return written.meta.changes > 0 ? "applied" : "stale";
    },
  };
}

const GRANT = `SELECT id, plan_handle, reason, granted_by, starts_at, expires_at, revoked_at FROM shop_plan_grants`;

function grantOf(row: Record<string, unknown>): StoredPlanGrant | null {
  const id = row["id"];
  const handle = row["plan_handle"];
  const startsAt = num(row, "starts_at");
  const expiresAt = num(row, "expires_at");
  if (typeof id !== "string" || typeof handle !== "string" || startsAt === null || expiresAt === null) return null;
  const reason = row["reason"];
  const grantedBy = row["granted_by"];
  return {
    id,
    planHandle: handle,
    ...(typeof reason === "string" ? { reason } : {}),
    ...(typeof grantedBy === "string" ? { grantedBy } : {}),
    startsAt,
    expiresAt,
    revokedAt: num(row, "revoked_at"),
  };
}

/** The plans staff gave (`PlanGrantStore`). `newId` and `now` come from the composition root. */
export function d1PlanGrants(db: D1Database, newId: () => string, now: () => number): PlanGrantStore {
  return {
    async findActive(shop, at) {
      const row = await db
        .prepare(`${GRANT} WHERE shop = ?1 AND starts_at <= ?2 AND expires_at > ?2 AND revoked_at IS NULL ORDER BY expires_at DESC LIMIT 1`)
        .bind(shop, at)
        .first();
      return row === null ? null : grantOf(row);
    },
    async list(shop) {
      const rows = await db.prepare(`${GRANT} WHERE shop = ?1 ORDER BY created_at DESC LIMIT 100`).bind(shop).all();
      return rows.results.flatMap((row) => grantOf(row) ?? []);
    },
    async create(shop, grant) {
      const id = newId();
      await db
        .prepare(`INSERT INTO shop_plan_grants (id, shop, plan_handle, reason, granted_by, starts_at, expires_at, revoked_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)`)
        .bind(id, shop, grant.planHandle, grant.reason ?? "", grant.grantedBy ?? "", grant.startsAt, grant.expiresAt, now())
        .run();
      return { id, ...grant };
    },
    async revoke(shop, grantId, revokedBy, at) {
      const done = await db
        .prepare(`UPDATE shop_plan_grants SET revoked_at = ?3, revoked_by = ?4 WHERE id = ?1 AND shop = ?2 AND revoked_at IS NULL`)
        .bind(grantId, shop, at, revokedBy)
        .run();
      return done.meta.changes > 0;
    },
  };
}
