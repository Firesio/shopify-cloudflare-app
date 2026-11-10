import { describe, it, expect } from "vitest";
import { planPriceLine } from "./plan-price-line";
import type { BillingStatus, SubscriptionPhase } from "./subscription-status";
import { fromMinorUnits, toCurrency } from "~/money";
import { unwrap } from "~/lib/result";

const money = (minor: number, code = "USD") => unwrap(fromMinorUnits(minor, unwrap(toCurrency(code))));
const price = (minor: number) => money(minor);

const subscribed = (
  over: Partial<Extract<BillingStatus, { kind: "subscribed" }>> = {},
): BillingStatus => ({
  kind: "subscribed",
  phase: "active",
  name: "Pro",
  price: price(2999),
  interval: "every_30_days",
  trialEndsAt: null,
  currentPeriodEndsAt: 1_800_000_000_000,
  cancelsOn: null,
  ...over,
});

describe("the price line on the billing page", () => {
  it("says the free plan is free, with no catalogue amount or currency symbol", () => {
    // The catalogue is USD and the shop's currency need not be: zero needs no symbol.
    expect(planPriceLine({ kind: "free" })).toEqual({ cadence: "free" });
  });

  it("quotes a monthly subscriber their monthly price", () => {
    expect(planPriceLine(subscribed({ interval: "every_30_days" }))).toEqual({ price: price(2999), cadence: "monthly" });
  });

  it("quotes an ANNUAL subscriber the annual price, not a monthly one", () => {
    expect(planPriceLine(subscribed({ interval: "annual", price: price(29900) }))).toEqual({ price: price(29900), cadence: "yearly" });
  });

  it("shows the bare figure when Shopify reported no interval", () => {
    expect(planPriceLine(subscribed({ interval: null }))).toEqual({ price: price(2999), cadence: "none" });
  });

  it("shows nothing when the subscription carries no price, rather than the catalogue price", () => {
    // A grandfathered or discounted charge must not be quoted at list price.
    expect(planPriceLine(subscribed({ price: null }))).toBeNull();
  });

  it("keeps the subscription's own currency, never converting to the catalogue's", () => {
    const eur = money(1750, "EUR");
    expect(planPriceLine(subscribed({ price: eur }))).toEqual({ price: eur, cadence: "monthly" });
  });

  it.each<SubscriptionPhase>(["cancelled", "inactive"])("quotes no charge for a %s subscription", (phase) => {
    expect(planPriceLine(subscribed({ phase }))).toBeNull();
  });

  it.each<SubscriptionPhase>(["active", "cancelling", "frozen", "pending"])("still quotes the price for a %s subscription", (phase) => {
    expect(planPriceLine(subscribed({ phase }))).toEqual({ price: price(2999), cadence: "monthly" });
  });
});
