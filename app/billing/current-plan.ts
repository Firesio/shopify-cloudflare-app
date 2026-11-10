import { planForShopifyHandle, type PlanHandle } from "./plans";
import { grantsPaidAccess, type BillingStatus } from "./subscription-status";

type CurrentPlanInput = {
  readonly status: BillingStatus;
  /** Shopify's plan handle from the subscription projection. */
  readonly planHandle: string | null;
  /** The plan a live promotional grant lifts the shop to, when it outranks the subscription. */
  readonly promoHandle: PlanHandle | null;
};

/**
 * Which catalogue card carries "Current plan": the plan the shop's ENTITLEMENTS are on.
 *
 *   • A promotional grant that outranks the subscription wins.
 *   • No subscription, or one that grants no paid access (pending approval, frozen, cancelled, inactive), is the free
 *     plan — matching `resolveEffectivePlan`, which gives such a shop Free entitlements. Badging a pending Pro as
 *     "Current plan" would tell the merchant they have what they do not.
 *   • A paid subscription whose Shopify handle is not in the catalogue selects NO card: choosing Free would tell a
 *     paying merchant they are on Free, and choosing any other plan would be a guess.
 */
export function currentPlanHandleFor({ status, planHandle, promoHandle }: CurrentPlanInput): PlanHandle | null {
  if (promoHandle) return promoHandle;
  if (status.kind === "free" || !grantsPaidAccess(status.phase)) return "free";
  return planForShopifyHandle(planHandle)?.handle ?? null;
}
