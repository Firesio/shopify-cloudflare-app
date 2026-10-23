import { ShopifyPartnerAdapter } from "~/adapters/shopify-partner.server";
import { ENTITLEMENT_CATALOGUE } from "~/billing/entitlement-catalogue";
import { PLAN_LIST } from "~/billing/plans";
import type { SubscriptionSnapshot } from "~/domain/entitlement-policy";
import { subscriptionSnapshot } from "~/domain/subscription-snapshot";
import type { ShopifyEventRepo } from "~/models/shopify-events.server";
import type { ExistingQuotaOperation, SubscriptionPort } from "~/ports/entitlements";
import { EntitlementRepo } from "~/models/entitlements.server";
import { forgetRequestMemo, getEnv, requestMemo } from "~/request-context.server";
import { createEntitlements, type EntitlementService } from "~/services/entitlements.server";
import { reconcileShopHistory } from "~/services/reconcile-shopify-history";
import { refreshSubscription } from "~/services/reconcile-subscription";
import { entitlementCachePort, invalidateEntitlements, subscriptionMemoKey } from "~/wiring/entitlement-cache.server";
import { redactionGuard } from "~/wiring/redaction.server";
import { planGrants, shopifyEvents, shops, shopSubscriptions, shopSyncCheckpoints } from "~/wiring/repositories.server";
import { appRuntime } from "~/wiring/runtime.server";

/** A redacted shop is not refreshed: nothing is fetched or written, and callers see an ordinary failure. */
const redactedRefusal = { status: "failed", code: "SHOP_REDACTED", detail: "Shop was redacted; refresh suppressed" } as const;

export function subscriptionsPort(): SubscriptionPort {
  const readOne = async (shop: string): Promise<SubscriptionSnapshot> => {
    const now = appRuntime().clock.now();
    const relationship = await shops().get(shop);
    // Not installed: nothing else is read, and the answer does not depend on what billing still holds.
    if (relationship?.relationshipStatus !== "INSTALLED") return subscriptionSnapshot({ installed: false, projection: undefined, grant: null, timeZone: null }, PLAN_LIST, now);
    const [projection, grant] = await Promise.all([shopSubscriptions().currentForShop(shop), planGrants().findActiveGrant(shop, now)]);
    return subscriptionSnapshot({ installed: true, projection, grant, timeZone: relationship.timeZone }, PLAN_LIST, now);
  };
  // Three batched reads for any number of shops. `listCurrentForShops` lists each shop's current subscription first.
  const readMany = async (shopDomains: readonly string[]): Promise<ReadonlyMap<string, SubscriptionSnapshot>> => {
    const now = appRuntime().clock.now();
    const [rows, projections, grants] = await Promise.all([shops().getMany(shopDomains), shopSubscriptions().listCurrentForShops(shopDomains), planGrants().findActiveGrants(shopDomains, now)]);
    const currentOf = new Map<string, (typeof projections)[number]>();
    for (const projection of projections) if (!currentOf.has(projection.shop)) currentOf.set(projection.shop, projection);
    return new Map([...new Set(shopDomains)].map((shop): [string, SubscriptionSnapshot] => {
      const relationship = rows.get(shop);
      const installed = relationship?.relationshipStatus === "INSTALLED";
      return [shop, subscriptionSnapshot({ installed, projection: installed ? currentOf.get(shop) : undefined, grant: installed ? grants.get(shop) : null, timeZone: relationship?.timeZone ?? null }, PLAN_LIST, now)];
    }));
  };
  // One snapshot per shop per request: a page runs several entitlement checks and each used to repeat the three D1
  // reads. A refresh or an invalidation drops it, so a check after a write in the same request sees the write.
  const current = (shop: string) => requestMemo(subscriptionMemoKey(shop), () => readOne(shop));
  return { current, currentForShops: readMany, async refresh(shop) {
    const env = getEnv();
    forgetRequestMemo(subscriptionMemoKey(shop));
    const result = await refreshShopSubscription(env, shop);
    if (result.status === "failed") throw new Error(result.detail);
    forgetRequestMemo(subscriptionMemoKey(shop));
    return current(shop);
  } };
}

export function entitlements(): EntitlementService {
  const repo = new EntitlementRepo(appRuntime().clock);
  return createEntitlements({
    subscriptions: subscriptionsPort(),
    usage: {
      find: async (shop, operationId) => {
        const row = await repo.findOperation(shop, operationId);
        const state = row?.state;
        const validState = state === "held" || state === "committed" || state === "released";
        const operation: ExistingQuotaOperation | undefined = row && validState
          ? { key: row.key, amount: row.requestedAmount, period: row.period, subscriptionRevision: row.subscriptionRevision, state }
          : undefined;
        return operation;
      },
      reserve: (input) => repo.reserve(input),
      readUsage: (shop, key, period) => repo.readUsage(shop, key, period),
      commit: async (input) => {
        const result = await repo.commit(input);
        return "reason" in result
          ? { allowed: false, reason: result.reason }
          : { allowed: true, operationId: input.operationId, state: "committed", ...(result.replayed ? { replayed: true } : {}) };
      },
      release: async (input) => {
        const result = await repo.release(input);
        return "reason" in result
          ? { allowed: false, reason: result.reason }
          : { allowed: true, operationId: input.operationId, state: result.state === "committed" ? "committed" : "released", ...(result.replayed ? { replayed: true } : {}) };
      },
    },
    capacity: { allocate: (input) => repo.allocate(input), confirmAllocation: (input) => repo.confirmAllocation(input), deallocate: (input) => repo.deallocate(input), adopt: (input) => repo.adopt(input), readAllocations: (shop, key) => repo.readAllocations(shop, key) },
    cache: entitlementCachePort(),
    catalogue: ENTITLEMENT_CATALOGUE,
  });
}

/** Targeted billing refresh composition. Missing Partner credentials stay observable. */
export async function refreshShopSubscription(env: Env, shop: string, now = appRuntime().clock.now()) {
  if (await redactionGuard().isSuppressed(shop, "scheduled_sweep")) return redactedRefusal;
  const identity = await shops().get(shop);
  const partner = new ShopifyPartnerAdapter({
    token: env.SHOPIFY_PARTNER_API_TOKEN || "",
    organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID || "",
    apiVersion: env.SHOPIFY_PARTNER_API_VERSION || "",
    fetch,
  });
  const result = await refreshSubscription({
    partner,
    subscriptions: { upsertSubscriptionProjection: (tenant, observation) => shopSubscriptions().upsertObservation(tenant, observation) },
    clock: { now: () => now },
    appId: env.SHOPIFY_PARTNER_APP_ID || null,
  }, { shop, shopifyShopId: identity?.shopifyShopId ?? null, installedAt: identity?.installedAt ?? null }, now);
  // The projection just changed: a check later in this request must not see the snapshot read before it.
  forgetRequestMemo(subscriptionMemoKey(shop));
  return result;
}

export async function refreshShopHistory(env: Env, shop: string, now = appRuntime().clock.now()) {
  // Before anything is written: a checkpoint row is named after the shop and would put the domain back.
  if (await redactionGuard().isSuppressed(shop, "scheduled_sweep")) return redactedRefusal;
  const identity = await shops().get(shop);
  const checkpoints = shopSyncCheckpoints();
  const result = await reconcileShopHistory({
    partner: new ShopifyPartnerAdapter({ token: env.SHOPIFY_PARTNER_API_TOKEN || "", organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID || "", apiVersion: env.SHOPIFY_PARTNER_API_VERSION || "", fetch }),
    ledger: historyLedger(),
    clock: { now: () => now },
    appId: env.SHOPIFY_PARTNER_APP_ID || null,
    redaction: redactionGuard(),
  }, { shop, shopifyShopId: identity?.shopifyShopId ?? null, installedAt: identity?.installedAt ?? null }, now);
  const checkpointName = `partner_history:${shop}`;
  if (result.status === "succeeded") {
    await Promise.all([
      shops().markReconciled(shop, now),
      checkpoints.markSucceeded(checkpointName, null, now, now),
    ]);
  } else {
    await checkpoints.markFailed(checkpointName, result.code, result.detail, now);
  }
  return result;
}

/** History ledger adapter binding kept here so services never import models. */
export function historyLedger() {
  const repo = shopifyEvents();
  return {
    recordPartnerRelationship: (event: Parameters<ShopifyEventRepo["recordPartnerRelationship"]>[0]) => repo.recordPartnerRelationship(event),
    recordPartnerSubscription: async (event: Parameters<ShopifyEventRepo["recordPartnerSubscription"]>[0]) => {
      const result = await repo.recordPartnerSubscription(event);
      await invalidateEntitlements(event.shop);
      return result;
    },
  };
}
