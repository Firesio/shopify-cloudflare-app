import { describe, it, expect } from "vitest";
import {
  dateOnlyInstant,
  grantsPaidAccess,
  resolveProjectionBillingStatus,
  type PartnerSubscriptionProjection,
  type SubscriptionPhase,
} from "./subscription-status";
import type { SubscriptionStatus } from "~/domain/subscription-lifecycle";

const NOW = Date.parse("2026-01-15T00:00:00.000Z");

function projection(over: Partial<PartnerSubscriptionProjection> = {}): PartnerSubscriptionProjection {
  return {
    status: "ACTIVE",
    planHandle: "pro",
    billingInterval: "EVERY_30_DAYS",
    priceAmount: 1900,
    priceCurrency: "USD",
    trialEndsAt: null,
    currentPeriodEndsAt: Date.parse("2026-02-01T00:00:00.000Z"),
    cancelEffectiveOn: null,
    ...over,
  };
}

describe("resolveProjectionBillingStatus", () => {
  it("uses the Partner-backed projection", () => {
    expect(resolveProjectionBillingStatus(projection(), "Pro", NOW)).toEqual({
      kind: "subscribed",
      phase: "active",
      name: "Pro",
      price: { amount: 1900, currency: "USD" },
      interval: "every_30_days",
      trialEndsAt: null,
      currentPeriodEndsAt: Date.parse("2026-02-01T00:00:00.000Z"),
      cancelsOn: null,
    });
  });

  it("treats no projection and NONE as the free plan", () => {
    expect(resolveProjectionBillingStatus(undefined, null, NOW)).toEqual({ kind: "free" });
    expect(resolveProjectionBillingStatus(projection({ status: "NONE", planHandle: null }), null, NOW)).toEqual({ kind: "free" });
  });

  it.each<[Exclude<SubscriptionStatus, "NONE">, SubscriptionPhase]>([
    ["ACTIVE", "active"],
    ["CANCELLATION_SCHEDULED", "cancelling"],
    ["FROZEN", "frozen"],
    ["PENDING", "pending"],
    ["CANCELED", "cancelled"],
    ["UNKNOWN", "inactive"],
  ])("maps Partner %s to the %s phase, never to an 'Active' one it is not", (status, phase) => {
    expect(resolveProjectionBillingStatus(projection({ status }), "Pro", NOW)).toMatchObject({ kind: "subscribed", phase });
  });

  it("keeps an unknown plan handle nameless instead of borrowing another plan's name", () => {
    expect(resolveProjectionBillingStatus(projection({ planHandle: "retired" }), null, NOW)).toMatchObject({ name: null });
  });

  it("never invents a billing date: an unknown period end stays unknown (not 'now')", () => {
    const status = resolveProjectionBillingStatus(projection({ currentPeriodEndsAt: null }), "Pro", NOW);
    expect(status).toMatchObject({ currentPeriodEndsAt: null });
  });

  it("reports a trial only while it is still running", () => {
    expect(resolveProjectionBillingStatus(projection({ trialEndsAt: NOW + 1 }), "Pro", NOW)).toMatchObject({ trialEndsAt: NOW + 1 });
    expect(resolveProjectionBillingStatus(projection({ trialEndsAt: NOW }), "Pro", NOW)).toMatchObject({ trialEndsAt: null });
    expect(resolveProjectionBillingStatus(projection({ trialEndsAt: NOW - 1 }), "Pro", NOW)).toMatchObject({ trialEndsAt: null });
  });

  it("does not call a frozen or pending subscription a trial", () => {
    for (const status of ["FROZEN", "PENDING", "CANCELED", "CANCELLATION_SCHEDULED"] as const) {
      expect(resolveProjectionBillingStatus(projection({ status, trialEndsAt: NOW + 1000 }), "Pro", NOW)).toMatchObject({ trialEndsAt: null });
    }
  });

  it("carries the scheduled cancellation DATE only for a cancelling subscription", () => {
    const scheduled = resolveProjectionBillingStatus(projection({ status: "CANCELLATION_SCHEDULED", cancelEffectiveOn: "2026-02-10" }), "Pro", NOW);
    expect(scheduled).toMatchObject({ phase: "cancelling", cancelsOn: "2026-02-10" });
    expect(resolveProjectionBillingStatus(projection({ status: "ACTIVE", cancelEffectiveOn: "2026-02-10" }), "Pro", NOW)).toMatchObject({ cancelsOn: null });
  });

  it("drops a cancellation date that is not a real calendar date", () => {
    for (const cancelEffectiveOn of ["2026-02-30", "soon", "2026-2-1", ""]) {
      expect(resolveProjectionBillingStatus(projection({ status: "CANCELLATION_SCHEDULED", cancelEffectiveOn }), "Pro", NOW)).toMatchObject({ cancelsOn: null });
    }
  });

  it("keeps the price in the subscription's own currency", () => {
    expect(resolveProjectionBillingStatus(projection({ priceAmount: 1750, priceCurrency: "EUR" }), "Pro", NOW)).toMatchObject({ price: { amount: 1750, currency: "EUR" } });
    expect(resolveProjectionBillingStatus(projection({ priceAmount: 1900, priceCurrency: "JPY" }), "Pro", NOW)).toMatchObject({ price: { amount: 1900, currency: "JPY" } });
  });

  it("has no price when the amount or a real currency is missing", () => {
    expect(resolveProjectionBillingStatus(projection({ priceAmount: null }), "Pro", NOW)).toMatchObject({ price: null });
    expect(resolveProjectionBillingStatus(projection({ priceCurrency: null }), "Pro", NOW)).toMatchObject({ price: null });
    expect(resolveProjectionBillingStatus(projection({ priceCurrency: "ZZZ" }), "Pro", NOW)).toMatchObject({ price: null });
    expect(resolveProjectionBillingStatus(projection({ priceAmount: 19.5 }), "Pro", NOW)).toMatchObject({ price: null });
  });

  it("reads the billing interval, and leaves an unreported one null", () => {
    expect(resolveProjectionBillingStatus(projection({ billingInterval: "ANNUAL" }), "Pro", NOW)).toMatchObject({ interval: "annual" });
    expect(resolveProjectionBillingStatus(projection({ billingInterval: "EVERY_30_DAYS" }), "Pro", NOW)).toMatchObject({ interval: "every_30_days" });
    expect(resolveProjectionBillingStatus(projection({ billingInterval: "WEEKLY" }), "Pro", NOW)).toMatchObject({ interval: null });
    expect(resolveProjectionBillingStatus(projection({ billingInterval: null }), "Pro", NOW)).toMatchObject({ interval: null });
  });
});

describe("grantsPaidAccess", () => {
  it.each<[SubscriptionPhase, boolean]>([
    ["active", true],
    ["cancelling", true],
    ["frozen", false],
    ["pending", false],
    ["cancelled", false],
    ["inactive", false],
  ])("%s -> %s", (phase, expected) => {
    expect(grantsPaidAccess(phase)).toBe(expected);
  });
});

describe("dateOnlyInstant", () => {
  it("is midnight UTC of the named calendar day", () => {
    expect(dateOnlyInstant("2026-02-10")).toBe(Date.parse("2026-02-10T00:00:00.000Z"));
    expect(dateOnlyInstant("2028-02-29")).toBe(Date.parse("2028-02-29T00:00:00.000Z"));
  });

  it("refuses anything that is not a real date", () => {
    for (const value of [null, "", "2026-13-01", "2026-02-30", "2027-02-29", "2026-02-10T00:00:00Z", "10/02/2026"]) {
      expect(dateOnlyInstant(value)).toBeNull();
    }
  });
});
