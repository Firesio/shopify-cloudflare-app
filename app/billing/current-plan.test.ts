import { describe, it, expect } from "vitest";
import { currentPlanHandleFor } from "./current-plan";
import { PLANS, PLAN_LIST } from "./plans";
import { resolveEffectivePlan } from "~/domain/plan-hierarchy";
import type { SubscriptionStatus } from "~/domain/subscription-lifecycle";
import { resolveProjectionBillingStatus, type BillingStatus, type SubscriptionPhase } from "./subscription-status";

const FREE_STATUS: BillingStatus = { kind: "free" };

function subscribed(phase: SubscriptionPhase = "active"): BillingStatus {
  return {
    kind: "subscribed",
    phase,
    name: "Professional",
    price: null,
    interval: null,
    trialEndsAt: null,
    currentPeriodEndsAt: 1_700_000_000_000,
    cancelsOn: null,
  };
}

describe("currentPlanHandleFor", () => {
  it("resolves the free plan when there is no subscription", () => {
    expect(currentPlanHandleFor({ status: FREE_STATUS, planHandle: null, promoHandle: null })).toBe("free");
  });

  it("resolves an entitled subscription by immutable Shopify plan handle, not display name", () => {
    expect(currentPlanHandleFor({ status: subscribed("active"), planHandle: "pro", promoHandle: null })).toBe("pro");
    expect(currentPlanHandleFor({ status: subscribed("cancelling"), planHandle: "pro", promoHandle: null })).toBe("pro");
  });

  it.each<SubscriptionPhase>(["pending", "frozen", "cancelled", "inactive"])(
    "a %s Pro subscription grants no paid access, so Free carries the badge, not Pro",
    (phase) => {
      expect(currentPlanHandleFor({ status: subscribed(phase), planHandle: "pro", promoHandle: null })).toBe("free");
    },
  );

  it("does not guess a paid card when an entitled subscription's handle is unknown", () => {
    expect(currentPlanHandleFor({ status: subscribed(), planHandle: "retired-plan", promoHandle: null })).toBeNull();
    expect(currentPlanHandleFor({ status: subscribed(), planHandle: null, promoHandle: null })).toBeNull();
  });

  it("a promotional plan wins over everything else", () => {
    expect(currentPlanHandleFor({ status: FREE_STATUS, planHandle: null, promoHandle: "pro" })).toBe("pro");
    expect(currentPlanHandleFor({ status: subscribed("frozen"), planHandle: "pro", promoHandle: "pro" })).toBe("pro");
  });
});

describe("the badge agrees with the entitlements, for every Partner status", () => {
  const STATUSES: readonly SubscriptionStatus[] = ["NONE", "PENDING", "ACTIVE", "CANCELLATION_SCHEDULED", "FROZEN", "CANCELED", "UNKNOWN"];
  const NOW = 1_700_000_000_000;

  it.each(STATUSES)("%s", (status) => {
    const projection = {
      status,
      planHandle: PLANS.pro.handle,
      billingInterval: null,
      priceAmount: null,
      priceCurrency: null,
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      cancelEffectiveOn: null,
    };
    const effective = resolveEffectivePlan(projection.planHandle, status, null, PLAN_LIST, NOW);
    const billing = resolveProjectionBillingStatus(projection, PLANS.pro.name, NOW);

    expect(currentPlanHandleFor({ status: billing, planHandle: projection.planHandle, promoHandle: null })).toBe(effective.planHandle);
  });
});
