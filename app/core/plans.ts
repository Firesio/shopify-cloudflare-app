import { money } from "@firesio/money";
import { definePlans, limit, unlimited } from "@firesio/plans";

/**
 * THE ONE PLACE plans are defined (`@firesio/plans`). The plan handle is the Shopify Managed Pricing handle and the key
 * that joins Shopify's subscription to this table; Shopify's Partner Dashboard keeps the real price. Cheapest first.
 * Every plan declares every entitlement key (a key one plan forgets does not compile).
 *
 * TODO: replace the names, prices and limits before launch (`npm run check:placeholders` fails until you do).
 */
export const PLANS = definePlans({
  free: {
    name: "TODO:FREE",
    monthly: money(0, "USD"),
    annual: money(0, "USD"),
    entitlements: { "tickets.max": limit(50), "members.max": unlimited, "mail.daily_max": limit(100) },
  },
  pro: {
    name: "TODO:PRO",
    monthly: money(1900, "USD"),
    // TODO: your real annual price (about two months free is the usual convention).
    annual: money(19000, "USD"),
    entitlements: { "tickets.max": unlimited, "members.max": unlimited, "mail.daily_max": limit(2000) },
  },
});

export type PlanHandle = keyof typeof PLANS;
