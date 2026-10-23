import { describe, expect, it } from "vitest";
import * as policy from "./entitlement-policy";

const utc = (iso: string): number => Date.parse(iso);
const catalogue: policy.EntitlementCatalogue = {
  version: 1,
  freePlan: "free",
  features: {
    monthly: { kind: "quota", period: "calendar_month" },
    lifetime: { kind: "quota", period: "lifetime" },
    cycle: { kind: "quota", period: "billing_period" },
  },
  plans: { free: { monthly: { kind: "limit", maximum: 10 }, lifetime: { kind: "limit", maximum: 10 }, cycle: { kind: "limit", maximum: 10 } } },
};
const base: policy.SubscriptionSnapshot = { status: "NONE", planHandle: null, revision: 1 };
// 2026-03-31 20:00Z is already 1 April in Auckland (NZDT, UTC+13) and still 31 March in UTC and Los Angeles.
const instant = utc("2026-03-31T20:00:00Z");

describe("calendar_month quota window", () => {
  it("is the UTC month when the snapshot names no time zone", () => {
    expect(policy.resolveEntitlement(catalogue, base, "monthly", instant)).toMatchObject({
      allowed: true,
      kind: "quota",
      window: { kind: "calendar_month", key: "2026-03", start: utc("2026-03-01T00:00:00Z"), end: utc("2026-04-01T00:00:00Z") },
    });
  });

  it("is the month of the snapshot's time zone, keyed by that zone's own YYYY-MM", () => {
    expect(policy.resolveEntitlement(catalogue, { ...base, timeZone: "Pacific/Auckland" }, "monthly", instant)).toMatchObject({
      allowed: true,
      kind: "quota",
      maximum: 10,
      window: { kind: "calendar_month", key: "2026-04", start: utc("2026-03-31T11:00:00Z"), end: utc("2026-04-30T12:00:00Z") },
    });
    expect(policy.resolveEntitlement(catalogue, { ...base, timeZone: "America/Los_Angeles" }, "monthly", instant)).toMatchObject({
      window: { key: "2026-03", start: utc("2026-03-01T08:00:00Z"), end: utc("2026-04-01T07:00:00Z") },
    });
  });

  it("fails closed for a zone the runtime does not know, and for an empty one", () => {
    for (const timeZone of ["Mars/Olympus", ""]) {
      expect(policy.resolveEntitlement(catalogue, { ...base, timeZone }, "monthly", instant)).toEqual({ allowed: false, reason: "invalid_usage_window" });
    }
  });

  it("leaves lifetime and billing-period quotas alone, whatever the zone", () => {
    const subscription: policy.SubscriptionSnapshot = { ...base, status: "ACTIVE", planHandle: "free", timeZone: "Pacific/Auckland", periodStart: instant - 1000, periodEnd: instant + 1000 };
    expect(policy.resolveEntitlement(catalogue, subscription, "lifetime", instant)).toMatchObject({ window: { kind: "lifetime", key: "lifetime" } });
    expect(policy.resolveEntitlement(catalogue, subscription, "cycle", instant)).toMatchObject({ window: { kind: "billing_period", start: instant - 1000, end: instant + 1000 } });
  });

  it("is what resolveUsageWindow returns directly", () => {
    expect(policy.resolveUsageWindow("calendar_month", instant, { ...base, timeZone: "Pacific/Auckland" })).toEqual({
      kind: "calendar_month",
      key: "2026-04",
      start: utc("2026-03-31T11:00:00Z"),
      end: utc("2026-04-30T12:00:00Z"),
    });
  });
});
