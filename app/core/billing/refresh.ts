import type { Emitter } from "@firesio/portal-client";
import type { SubscriptionStatus as ContractStatus } from "@firesio/portal-contract";
import type { Billing, SubscriptionStatus } from "@firesio/plans/billing";
import { phaseFor } from "@firesio/plans/billing";
import { accountOf } from "../shops/lifecycle";
import { PLANS } from "../plans";

export interface RefreshDeps {
  readonly billing: Billing<typeof PLANS>;
  readonly portal: Emitter;
  readonly now: () => number;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

const contractStatus = (status: SubscriptionStatus): ContractStatus => phaseFor(status);

/**
 * Read the shop's subscription from the Partner API, store it, and tell the portal when what the shop is served changed
 * (`subscription.changed`). The portal reads revenue from the daily `metrics.snapshot`, not from adding these up, so an event
 * is sent for a change of plan or status and for nothing else. A failure is logged and returned: the merchant's page never waits on it.
 */
export async function refreshSubscription(deps: RefreshDeps, shop: { readonly domain: string; readonly shopifyShopId: string | null }): Promise<"changed" | "unchanged" | "failed"> {
  const before = await deps.billing.effectivePlan(shop.domain);
  const result = await deps.billing.refresh(shop);
  if (!result.ok) {
    deps.log({ event: "subscription.refresh_failed", reason: result.reason });
    return "failed";
  }
  if (result.outcome !== "applied") return "unchanged";
  const previous = before.ok ? { plan: before.effective.planHandle, status: before.subscription?.status } : null;
  if (previous !== null && previous.plan === result.effective.planHandle && previous.status === result.subscription?.status) return "unchanged";
  const status = result.subscription?.status ?? "NONE";
  const plan = PLANS[result.effective.planHandle];
  const at = deps.now();
  const sent = await deps.portal.subscriptionChanged(
    accountOf(shop.domain),
    { planId: result.effective.planHandle, status: contractStatus(status), ...(plan.monthly.amount > 0 ? { price: plan.monthly } : {}), ...(result.effective.source === "grant" ? { granted: true } : {}) },
    { eventId: `subscription:${shop.domain}:${result.subscription?.appliedOccurredAt ?? at}:${result.subscription?.appliedExternalId ?? "none"}`, occurredAt: new Date(at) },
  );
  if (!sent.ok) deps.log({ event: "portal.event_failed", type: "subscription.changed", reason: sent.reason });
  return "changed";
}
