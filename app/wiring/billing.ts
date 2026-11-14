import { createUsage } from "@firesio/plans";
import { d1UsageStore } from "@firesio/plans/d1";
import { createBilling, partnerSubscriptionSource } from "@firesio/plans/billing";
import { d1PlanGrants, d1SubscriptionStore } from "~/adapters/d1-billing";
import { PLANS } from "~/core/plans";
import type { Runtime } from "./runtime";

/**
 * Plans (`@firesio/plans`): the effective plan of a shop (Managed Pricing subscription, or a staff gift), the Partner API
 * read, and the usage counters. The tables are the app's (`adapters/d1-billing.ts`); `PARTNER_API_TOKEN` is a secret.
 */
export function billingServices(env: Env, runtime: Runtime) {
  const billing = createBilling({
    plans: PLANS,
    source: partnerSubscriptionSource({ organizationId: env.PARTNER_ORG_ID, appId: env.PARTNER_APP_ID, token: env.PARTNER_API_TOKEN, fetch: (url, init) => fetch(url, init) }),
    store: d1SubscriptionStore(env.DB, runtime.now),
    grants: d1PlanGrants(env.DB, runtime.uuid, runtime.now),
    now: runtime.now,
  });
  const usage = createUsage<"mail.daily">(d1UsageStore(env.DB));
  return { billing, usage, grants: d1PlanGrants(env.DB, runtime.uuid, runtime.now) };
}
