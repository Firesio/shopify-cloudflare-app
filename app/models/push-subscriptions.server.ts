import { and, count, eq } from "drizzle-orm";
import { pushSubscriptions, type PushSubscriptionRow } from "~/db/schema";
import type { NewPushSubscription, PushSubscriptionRecord, PushSubscriptionStore } from "~/ports/push-subscriptions";
import { getDb } from "~/request-context.server";

function toRecord(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    adminUserId: row.adminUserId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    label: row.label,
    kind: row.kind,
    enabled: row.enabled,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * The ONLY place `push_subscriptions` is queried.
 *
 * Not shop-scoped (these are our own staff's devices); the tenant boundary here
 * is the ADMIN: every method that takes an `adminUserId` filters on it, so one
 * staff member can neither see, switch off nor remove another's device. The
 * three methods without it (`findById`, `removeById`, `markUsed`) are the
 * sender's, which only ever has a subscription id from a queue message.
 */
export class PushSubscriptionRepo implements PushSubscriptionStore {
  async listForAdmin(adminUserId: string): Promise<readonly PushSubscriptionRecord[]> {
    const rows = await getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.adminUserId, adminUserId))
      .orderBy(pushSubscriptions.createdAt, pushSubscriptions.id);
    return rows.map(toRecord);
  }

  async countForAdmin(adminUserId: string): Promise<number> {
    const [row] = await getDb()
      .select({ total: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.adminUserId, adminUserId));
    return row?.total ?? 0;
  }

  /**
   * One statement: an existing endpoint is MOVED to this admin (a handed-over
   * device, or the same browser registering again) with fresh keys, label and
   * switched back on, rather than duplicated. The existing row keeps its id, so
   * a message already queued for it still resolves.
   */
  async upsert(adminUserId: string, input: NewPushSubscription): Promise<void> {
    await getDb()
      .insert(pushSubscriptions)
      .values({
        id: input.id,
        adminUserId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        label: input.label,
        kind: input.kind,
        enabled: true,
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          adminUserId,
          p256dh: input.p256dh,
          auth: input.auth,
          label: input.label,
          kind: input.kind,
          enabled: true,
          createdAt: input.now,
          lastUsedAt: null,
        },
      });
  }

  async setEnabled(adminUserId: string, id: string, enabled: boolean): Promise<boolean> {
    const rows = await getDb()
      .update(pushSubscriptions)
      .set({ enabled })
      .where(and(eq(pushSubscriptions.adminUserId, adminUserId), eq(pushSubscriptions.id, id)))
      .returning({ id: pushSubscriptions.id });
    return rows.length > 0;
  }

  async remove(adminUserId: string, id: string): Promise<boolean> {
    const rows = await getDb()
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.adminUserId, adminUserId), eq(pushSubscriptions.id, id)))
      .returning({ id: pushSubscriptions.id });
    return rows.length > 0;
  }

  async findById(id: string): Promise<PushSubscriptionRecord | undefined> {
    const rows = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id)).limit(1);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async removeById(id: string): Promise<void> {
    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async markUsed(id: string, now: number): Promise<void> {
    await getDb().update(pushSubscriptions).set({ lastUsedAt: now }).where(eq(pushSubscriptions.id, id));
  }
}
