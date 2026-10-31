import { describe, expect, it } from "vitest";
import { PLAN_LIST } from "~/billing/plans";
import { subscriptionSnapshot, type SnapshotFacts } from "./subscription-snapshot";

const ladder = PLAN_LIST;
const NOW = 1_000_000;
const projection = (patch: Partial<NonNullable<SnapshotFacts["projection"]>> = {}) => ({
  status: "ACTIVE" as const,
  planHandle: "pro",
  revision: 4,
  currentPeriodStartsAt: 100,
  currentPeriodEndsAt: 2_000_000,
  cancellationEffectiveAt: null,
  ...patch,
});
const facts = (patch: Partial<SnapshotFacts> = {}): SnapshotFacts => ({ installed: true, projection: projection(), grant: null, timeZone: null, ...patch });

describe("subscriptionSnapshot", () => {
  it("reads an installed shop's projection as it is", () => {
    expect(subscriptionSnapshot(facts(), ladder, NOW)).toEqual({ status: "ACTIVE", planHandle: "pro", revision: 4, periodStart: 100, periodEnd: 2_000_000 });
  });

  it("is UNKNOWN, with no plan, for a shop that is not installed, whatever its projection says", () => {
    expect(subscriptionSnapshot(facts({ installed: false }), ladder, NOW)).toEqual({ status: "UNKNOWN", planHandle: null, revision: 0 });
  });

  it("is UNKNOWN for an installed shop whose billing was never observed: no free plan is manufactured", () => {
    expect(subscriptionSnapshot(facts({ projection: undefined }), ladder, NOW)).toEqual({ status: "UNKNOWN", planHandle: null, revision: 0 });
  });

  it("carries a scheduled cancellation's date", () => {
    expect(subscriptionSnapshot(facts({ projection: projection({ status: "CANCELLATION_SCHEDULED", cancellationEffectiveAt: 1_500_000 }) }), ladder, NOW)).toMatchObject({
      status: "CANCELLATION_SCHEDULED",
      cancellationEffectiveAt: 1_500_000,
    });
  });

  it("names the shop's time zone when it has one, and leaves it out when it has none", () => {
    expect(subscriptionSnapshot(facts({ timeZone: "Pacific/Auckland" }), ladder, NOW)).toMatchObject({ timeZone: "Pacific/Auckland" });
    expect(subscriptionSnapshot(facts({ timeZone: null }), ladder, NOW)).not.toHaveProperty("timeZone");
  });

  it("lifts a shop with a promotional grant to the higher plan and treats it as active", () => {
    const grant = { planHandle: "pro", startsAt: NOW - 1, expiresAt: NOW + 1000, revokedAt: null };
    expect(subscriptionSnapshot(facts({ projection: projection({ status: "NONE", planHandle: null, revision: 2, currentPeriodStartsAt: null, currentPeriodEndsAt: null }), grant }), ladder, NOW)).toMatchObject({
      status: "ACTIVE",
      planHandle: "pro",
      revision: 2,
      periodStart: NOW - 1,
      periodEnd: NOW + 1000,
    });
  });

  it("gives a promotion to an installed shop with no projection at all, at revision 0", () => {
    const grant = { planHandle: "pro", startsAt: NOW - 1, expiresAt: NOW + 1000, revokedAt: null };
    expect(subscriptionSnapshot(facts({ projection: undefined, grant }), ladder, NOW)).toMatchObject({ status: "ACTIVE", planHandle: "pro", revision: 0 });
  });

  it("ignores an expired or revoked grant", () => {
    const expired = { planHandle: "pro", startsAt: 0, expiresAt: NOW, revokedAt: null };
    const revoked = { planHandle: "pro", startsAt: 0, expiresAt: NOW + 1000, revokedAt: NOW - 1 };
    for (const grant of [expired, revoked]) {
      expect(subscriptionSnapshot(facts({ projection: projection({ status: "NONE", planHandle: null }), grant }), ladder, NOW)).toMatchObject({ status: "NONE", planHandle: "free" });
    }
  });
});
