import { money } from "@firesio/app/money";
import { capacity, definePlans } from "@firesio/app/plans";

/**
 * THE ONE PLACE plans are defined (`@firesio/app/plans`): the features, then the plans, each granting every feature (a grant one
 * plan forgets, or of the wrong type, does not compile). The plan handle is the Shopify Managed Pricing handle and the key that
 * joins Shopify's subscription to this table; Shopify's Partner Dashboard keeps the real price. Cheapest first, and exactly one
 * plan is free (`monthly` 0): the one a shop with no subscription is served.
 *
 * The plans page is generated from this: a feature's `name` is its row in the comparison, and every capacity and quota is a usage
 * meter (`show: false` keeps a feature off the page: a gate only). `members.max` is enforced by the members library (seats) and
 * shown as its ceiling. `tickets.max` is only SHOWN, with the count of open tickets beside it (the count reads the database, so it
 * is given in `app/firesio.server.ts`, the `counts` option; this file stays pure): the preset does not refuse a ticket
 * over it, so an app that wants a hard limit checks it in its own code (`check(services.plans, plan, "tickets.max", { used })`).
 *
 * Do not declare a feature nothing backs. A `quota` shows the usage counter kept under its own key, so add one together with the
 * `services.usage.consume(shop, "<key>", ...)` call that counts it (a meter nothing increments shows 0 forever); a `metered`
 * feature (usage billed by Shopify) needs its meter in the Partner Dashboard, `services.billedUsage.record(...)` and
 * `firesioSchemaPaths({ metered: true })` in `drizzle.config.ts`. The template declares neither: it has nothing to count or bill.
 *
 * TODO: replace the names, prices and limits before launch (`npm run check:placeholders` fails until you do).
 */
export const PLANS = definePlans({
  features: {
    "tickets.max": capacity({ name: "Open support tickets" }),
    "members.max": capacity({ name: "Team members" }),
  },
  plans: {
    free: {
      name: "TODO:FREE",
      monthly: money(0, "USD"),
      annual: money(0, "USD"),
      grants: { "tickets.max": 50, "members.max": "unlimited" },
    },
    pro: {
      name: "TODO:PRO",
      monthly: money(1900, "USD"),
      // TODO: your real annual price (about two months free is the usual convention).
      annual: money(19000, "USD"),
      grants: { "tickets.max": "unlimited", "members.max": "unlimited" },
    },
  },
});
