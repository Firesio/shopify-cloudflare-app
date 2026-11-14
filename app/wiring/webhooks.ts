import {
  chunkKeys,
  complianceHandlers,
  createRedactionGuard,
  createWebhookRouter,
  sha256ShopHasher,
  type ComplianceDeps,
  type WebhookRouter,
} from "@firesio/shopify";
import { d1TombstoneStore, d1WebhookInbox, inboxDeleteStatement, tombstoneStatement } from "@firesio/shopify/d1";
import { enqueueStatement } from "@firesio/portal-client/d1";
import type { SupportService } from "@firesio/support";
import { prepared } from "~/adapters/d1-batch";
import { KVSessionStorage } from "~/adapters/session-storage";
import { recordUninstall, accountOf, type LifecycleDeps } from "~/core/shops/lifecycle";
import type { Runtime } from "./runtime";
import type { Emitter } from "@firesio/portal-client";

/** Every table keyed by the shop, deleted in the purge's ONE batch (the library's tables and the app's). Support is purged first. */
const SHOP_SCOPED_DELETES: readonly string[] = [
  `DELETE FROM shops WHERE shop = ?1`,
  `DELETE FROM shop_subscriptions WHERE shop = ?1`,
  `DELETE FROM shop_plan_grants WHERE shop = ?1`,
  `DELETE FROM notification_preferences WHERE scope = ?1`,
  `DELETE FROM shop_members WHERE shop = ?1`,
  `DELETE FROM member_seat_episodes WHERE shop = ?1`,
  `DELETE FROM content_overrides WHERE account_id = ?1`,
  `DELETE FROM plan_usage WHERE subject = ?1`,
  `DELETE FROM push_devices WHERE account_id = ?1`,
  `DELETE FROM ai_runs WHERE shop = ?1`,
  // The shop's unsent and sent events carry its domain: they go, and the one fact that remains is `account.redacted`.
  `DELETE FROM portal_outbox WHERE account_kind = 'shopify_shop' AND account_id = ?1`,
];

export interface WebhookDeps {
  readonly env: Env;
  readonly runtime: Runtime;
  readonly portal: Emitter;
  readonly lifecycle: LifecycleDeps;
  readonly support: Pick<SupportService, "purgeShop">;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

export function redactionGuard(db: D1Database) {
  return createRedactionGuard({ hasher: sha256ShopHasher, tombstones: d1TombstoneStore(db) });
}

/** The purge of `shop/redact` (docs/architecture.md section 8): idempotent external erasures first, then ONE D1 batch with the tombstone and the `account.redacted` outbox row. */
function complianceDeps(deps: WebhookDeps): ComplianceDeps {
  const { env, runtime } = deps;
  return {
    // This template stores no end-customer data (a ticket holds the MERCHANT's words). A derived app that does must say
    // `{ stores: true, dataRequest, redact }` and really collect and erase it.
    customerData: { stores: false },
    now: runtime.now,
    purge: {
      hasher: sha256ShopHasher,
      before: [
        { name: "support", run: async (shop) => (await purgeSupport(deps, shop)) },
        { name: "sessions", run: (shop) => deleteSessions(new KVSessionStorage(env.SESSION, runtime.now), shop) },
      ],
      commit: async (shop, tombstone) => {
        const event = await deps.portal.build.accountRedacted(accountOf(shop), { eventId: `redacted_${tombstone.shopHash}`, occurredAt: new Date(tombstone.redactedAt) });
        const deletes = SHOP_SCOPED_DELETES.map((sql) => env.DB.prepare(sql).bind(shop));
        const redacted = event.ok ? [enqueueStatement(env.DB, event.value, new Date(tombstone.redactedAt))] : [];
        if (!event.ok) deps.log({ event: "portal.event_invalid", type: "account.redacted", reason: event.reason });
        await env.DB.batch(prepared([...deletes, inboxDeleteStatement(env.DB, shop), tombstoneStatement(env.DB, tombstone), ...redacted]));
        return deletes.length;
      },
    },
  };
}

async function purgeSupport(deps: WebhookDeps, shop: string): Promise<number> {
  const purged = await deps.support.purgeShop(shop);
  if (!purged.objectsDeleted) {
    // The rows are gone, the keys are in hand: try the bucket once more before failing so the queue retries the purge.
    for (const keys of chunkKeys(purged.r2Keys)) await deps.env.UPLOADS.delete([...keys]);
  }
  return purged.rows;
}

async function deleteSessions(storage: KVSessionStorage, shop: string): Promise<number> {
  const sessions = await storage.findSessionsByShop(shop);
  await storage.deleteSessions(sessions.map((session) => session.id));
  return sessions.length;
}

/** The topics this app handles: the uninstall, and the three mandatory compliance topics (docs/webhooks.md). */
export function webhookRouter(deps: WebhookDeps): WebhookRouter {
  return createWebhookRouter({
    "app/uninstalled": async (delivery) => {
      const outcome = await recordUninstall(deps.lifecycle, { shop: delivery.shop, webhookId: delivery.webhookId, occurredAt: delivery.triggeredAt });
      deps.log({ event: "webhook.uninstalled", outcome });
    },
    ...complianceHandlers(complianceDeps(deps)),
  });
}

export const inbox = (db: D1Database) => d1WebhookInbox(db);
