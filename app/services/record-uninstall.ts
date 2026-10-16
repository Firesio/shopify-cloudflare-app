import {
  decideUninstall,
  relationshipOf,
  type ShopRelationshipFacts,
  type UninstallObservation,
} from "~/domain/webhook-ordering";
import type { RelationshipState } from "~/domain/shop-lifecycle";
import { shopLog } from "~/observability/shop-log";
import type { ShopChange } from "~/services/announce-shop-change";
import type { UninstallReconciliationResult } from "~/services/reconcile-after-uninstall";

export interface RecordUninstallPorts {
  readonly shops: {
    facts(shop: string): Promise<ShopRelationshipFacts | undefined>;
    applyUninstall(shop: string, next: RelationshipState): Promise<"applied" | "stale">;
  };
  /** Drops what only an installed shop has (cached entitlements, sessions). Idempotent. */
  readonly cleanup: (shop: string) => Promise<void>;
  /** Re-reads Shopify's billing and history so the ledger reflects the uninstall. */
  readonly reconcile: (shop: string) => Promise<UninstallReconciliationResult>;
  /** Tells the staff who asked to hear about it. Decoration: a failure is logged, never raised. */
  readonly announce: (change: ShopChange) => Promise<void>;
}

export type UninstallOutcome = "recorded" | "already_uninstalled" | "ignored_stale" | "ignored_unknown_shop";

/**
 * The one way the app learns a shop uninstalled — from a webhook, or from our own probe of the token endpoint.
 *
 * The observation says WHEN the uninstall happened, so a late delivery cannot undo a reinstall that happened
 * after it (`decideUninstall`). Ordering is the whole point: callers never pass `Date.now()` for a fact that
 * Shopify timestamped.
 */
export async function recordUninstall(
  ports: RecordUninstallPorts,
  shop: string,
  observation: UninstallObservation,
): Promise<UninstallOutcome> {
  const facts = await ports.shops.facts(shop);
  const decision = decideUninstall(facts ? relationshipOf(facts) : null, observation);

  if (decision.outcome === "ignore") {
    await shopLog("shopify.uninstall.ignored", shop, { reason: decision.reason, occurredAt: observation.occurredAt });
    return decision.reason === "stale_uninstall" ? "ignored_stale" : "ignored_unknown_shop";
  }

  if (decision.outcome === "apply") {
    // The write repeats the ordering key, so a reinstall racing this call still wins.
    const written = await ports.shops.applyUninstall(shop, decision.next);
    if (written === "stale") {
      await shopLog("shopify.uninstall.ignored", shop, { reason: "stale_uninstall", occurredAt: observation.occurredAt });
      return "ignored_stale";
    }
    // Only an uninstall that was just RECORDED is news: an already-uninstalled shop or a stale delivery is not, and
    // the webhook and the cron probe may both observe the same one. The occasion is the moment Shopify says it
    // happened, so a redelivered webhook announces once. It is announced HERE, before the cleanup and the Shopify
    // reads, because a retry that finds the shop already uninstalled returns before reaching an announcement: if a
    // step below threw and the announcement came after it, the staff would never hear about this uninstall.
    await announceUninstall(ports, shop, observation.occurredAt);
  }

  await ports.cleanup(shop);
  const reconciled = await ports.reconcile(shop);
  if (!reconciled.ok) {
    await shopLog("shopify.uninstall.reconciliation_failed", shop, { code: reconciled.code, detail: reconciled.detail });
  }
  return decision.outcome === "apply" ? "recorded" : "already_uninstalled";
}

async function announceUninstall(ports: RecordUninstallPorts, shop: string, occurredAt: number): Promise<void> {
  try {
    await ports.announce({ kind: "uninstalled", shop, occasion: String(occurredAt), occurredAt });
  } catch (error) {
    await shopLog("shop.announce_failed", shop, { kind: "uninstalled", error: error instanceof Error ? error.name : "unknown" });
  }
}
