import { money } from "@firesio/app/money";
import { definePlans, limit, unlimited } from "@firesio/app/plans";

/**
 * THE ONE PLACE plans are defined (`@firesio/app/plans`). The plan handle is the Shopify Managed Pricing handle and the key
 * that joins Shopify's subscription to this table; Shopify's Partner Dashboard keeps the real price. Cheapest first.
 * Every plan declares every entitlement key (a key one plan forgets does not compile). `members.max` is enforced by the
 * members library (seats); `tickets.max` is only SHOWN, as the preset's open-ticket meter on the plans page: the preset does not
 * refuse a ticket over it, so an app that wants a hard limit checks it in its own code. Do not declare a key nothing backs: the
 * earlier `mail.daily_max` is gone on purpose, because nothing in the preset counts sent mail against a
 * daily allowance (the meter would read 0 forever). An app that sends mail of its own adds the key back together with the
 * `services.usage.consume` call and the `meters` entry in `app/firesio.server.ts`.
 *
 * TODO: replace the names, prices and limits before launch (`npm run check:placeholders` fails until you do).
 */
export const PLANS = definePlans({
  free: {
    name: "TODO:FREE",
    monthly: money(0, "USD"),
    annual: money(0, "USD"),
    entitlements: { "tickets.max": limit(50), "members.max": unlimited },
  },
  pro: {
    name: "TODO:PRO",
    monthly: money(1900, "USD"),
    // TODO: your real annual price (about two months free is the usual convention).
    annual: money(19000, "USD"),
    entitlements: { "tickets.max": unlimited, "members.max": unlimited },
  },
});

export type PlanHandle = keyof typeof PLANS;
