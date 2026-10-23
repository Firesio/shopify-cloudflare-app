import { describe, expect, it } from "vitest";
import type { EntitlementCatalogue, SubscriptionSnapshot } from "~/domain/entitlement-policy";
import type { AdoptResult, CapacityPort, UsagePort } from "~/ports/entitlements";
import { createEntitlements } from "./entitlements.server";

const catalogue: EntitlementCatalogue = {
  version: 1,
  freePlan: "free",
  features: {
    export: { kind: "capability" },
    docs: { kind: "quota", period: "calendar_month" },
    seats: { kind: "capacity" },
    off: { kind: "quota", period: "lifetime" },
  },
  plans: {
    free: { export: { kind: "disabled" }, docs: { kind: "limit", maximum: 10 }, seats: { kind: "limit", maximum: 5 }, off: { kind: "disabled" } },
    pro: { export: { kind: "enabled" }, docs: { kind: "unlimited" }, seats: { kind: "unlimited" }, off: { kind: "limit", maximum: 3 } },
  },
};
const active = (extra: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({ status: "ACTIVE", planHandle: "free", revision: 7, ...extra });
const NOW = Date.parse("2026-03-31T20:00:00Z");

function usagePort(read: (period: string) => { committed: number; held: number }, seen: string[] = []): UsagePort {
  return {
    reserve: async () => ({ allowed: false, reason: "invalid_request" }),
    commit: async () => ({ allowed: false, reason: "invalid_request" }),
    release: async () => ({ allowed: false, reason: "invalid_request" }),
    readUsage: async (_shop, _key, period) => {
      seen.push(period);
      return read(period);
    },
  };
}
const capacityPort = (overrides: Partial<CapacityPort> = {}): CapacityPort => ({
  allocate: async () => ({ allowed: false, reason: "invalid_request" }),
  confirmAllocation: async () => ({ allowed: false, reason: "invalid_request" }),
  deallocate: async () => ({ allowed: false, reason: "invalid_request" }),
  ...overrides,
});

describe("usage", () => {
  it("reports a quota's use in the period of the shop's time zone, against the plan's maximum", async () => {
    const seen: string[] = [];
    const service = createEntitlements({
      subscriptions: { current: async () => active({ timeZone: "Pacific/Auckland" }) },
      catalogue,
      usage: usagePort(() => ({ committed: 3, held: 2 }), seen),
      now: () => NOW,
    });
    expect(await service.usage("shop", "docs")).toMatchObject({
      allowed: true,
      kind: "quota",
      period: "calendar_month",
      window: { key: "2026-04" },
      used: 3,
      held: 2,
      maximum: 10,
      remaining: 5,
    });
    expect(seen).toEqual(["2026-04"]);
  });

  it("has no remaining under an unlimited grant, and never a negative one past the ceiling", async () => {
    const make = (planHandle: string, committed: number) =>
      createEntitlements({
        subscriptions: { current: async () => active({ planHandle }) },
        catalogue,
        usage: usagePort(() => ({ committed, held: 0 })),
        now: () => NOW,
      });
    const unlimited = await make("pro", 500).usage("shop", "docs");
    expect(unlimited).toMatchObject({ allowed: true, used: 500 });
    expect(unlimited).not.toHaveProperty("maximum");
    expect(unlimited).not.toHaveProperty("remaining");
    expect(await make("free", 12).usage("shop", "docs")).toMatchObject({ used: 12, maximum: 10, remaining: 0 });
  });

  it("reports a capacity's slots: confirmed ones used, held ones counted against what is left", async () => {
    const service = createEntitlements({
      subscriptions: { current: async () => active() },
      catalogue,
      capacity: capacityPort({ readAllocations: async () => ({ allocated: 2, held: 1 }) }),
      now: () => NOW,
    });
    expect(await service.usage("shop", "seats")).toEqual({ allowed: true, kind: "capacity", used: 2, held: 1, maximum: 5, remaining: 2 });
  });

  it("answers the refusals the policy gives, and refuses a key that is not counted", async () => {
    const service = createEntitlements({
      subscriptions: { current: async () => active() },
      catalogue,
      usage: usagePort(() => ({ committed: 0, held: 0 })),
      capacity: capacityPort({ readAllocations: async () => ({ allocated: 0, held: 0 }) }),
      now: () => NOW,
    });
    expect(await service.usage("shop", "off")).toEqual({ allowed: false, reason: "disabled" });
    expect(await service.usage("shop", "missing")).toEqual({ allowed: false, reason: "unknown_feature" });
    expect(await service.usage("shop", "export")).toEqual({ allowed: false, reason: "invalid_request" });
    expect(await service.usage(" ", "docs")).toEqual({ allowed: false, reason: "invalid_request" });
    expect(await service.usage("shop", "")).toEqual({ allowed: false, reason: "invalid_request" });
  });

  it("does not read usage for a subscription that is not active", async () => {
    let reads = 0;
    const service = createEntitlements({
      subscriptions: { current: async () => active({ status: "FROZEN" }) },
      catalogue,
      usage: usagePort(() => { reads += 1; return { committed: 0, held: 0 }; }),
      now: () => NOW,
    });
    expect(await service.usage("shop", "docs")).toEqual({ allowed: false, reason: "inactive_subscription" });
    expect(reads).toBe(0);
  });

  it("fails loudly when the app wired no reader, as it does for a missing port", async () => {
    const noReader = createEntitlements({ subscriptions: { current: async () => active() }, catalogue, usage: { ...usagePort(() => ({ committed: 0, held: 0 })), readUsage: undefined }, now: () => NOW });
    await expect(noReader.usage("shop", "docs")).rejects.toThrow("usage reader unavailable");
    const noCapacity = createEntitlements({ subscriptions: { current: async () => active() }, catalogue, capacity: capacityPort(), now: () => NOW });
    await expect(noCapacity.usage("shop", "seats")).rejects.toThrow("capacity reader unavailable");
  });

  it("never writes the cache", async () => {
    let writes = 0;
    const service = createEntitlements({
      subscriptions: { current: async () => active() },
      cache: { get: async () => null, set: async () => { writes += 1; }, invalidate: async () => undefined },
      catalogue,
      usage: usagePort(() => ({ committed: 1, held: 0 })),
      now: () => NOW,
    });
    await service.usage("shop", "docs");
    expect(writes).toBe(0);
  });
});

describe("adopt", () => {
  const input = { shop: "shop", key: "seats", allocationId: "plan-1", operationId: "adopt-plan-1" };

  it("books the resource under the snapshot's revision, whatever the plan allows", async () => {
    const seen: unknown[] = [];
    const booked: AdoptResult = { allowed: true, allocationId: "plan-1", operationId: "adopt-plan-1", state: "allocated" };
    const service = createEntitlements({
      subscriptions: { current: async () => active({ status: "FROZEN", revision: 9 }) },
      catalogue,
      capacity: capacityPort({ adopt: async (call) => { seen.push(call); return booked; } }),
      now: () => NOW,
    });
    expect(await service.adopt(input)).toEqual(booked);
    expect(seen).toEqual([{ ...input, subscriptionRevision: 9 }]);
  });

  it("refuses a key that is unknown or not a capacity, and blank identifiers, without touching the port", async () => {
    let calls = 0;
    const service = createEntitlements({
      subscriptions: { current: async () => active() },
      catalogue,
      capacity: capacityPort({ adopt: async () => { calls += 1; return { allowed: false, reason: "invalid_request" }; } }),
      now: () => NOW,
    });
    expect(await service.adopt({ ...input, key: "missing" })).toEqual({ allowed: false, reason: "unknown_feature" });
    expect(await service.adopt({ ...input, key: "docs" })).toEqual({ allowed: false, reason: "invalid_request" });
    expect(await service.adopt({ ...input, key: "export" })).toEqual({ allowed: false, reason: "invalid_request" });
    for (const blank of [{ shop: " " }, { allocationId: "" }, { operationId: "  " }]) {
      expect(await service.adopt({ ...input, ...blank })).toEqual({ allowed: false, reason: "invalid_request" });
    }
    expect(calls).toBe(0);
  });

  it("fails loudly when the app wired no adopt", async () => {
    const service = createEntitlements({ subscriptions: { current: async () => active() }, catalogue, capacity: capacityPort(), now: () => NOW });
    await expect(service.adopt(input)).rejects.toThrow("adopt unavailable");
  });
});

describe("resolveMany", () => {
  it("answers every key for every shop from one batch read", async () => {
    let batches = 0;
    let singles = 0;
    const snapshots = new Map<string, SubscriptionSnapshot>([
      ["free-shop", active()],
      ["pro-shop", active({ planHandle: "pro" })],
    ]);
    const service = createEntitlements({
      subscriptions: {
        current: async () => { singles += 1; return active(); },
        currentForShops: async (shops) => { batches += 1; return new Map(shops.flatMap((shop) => { const snapshot = snapshots.get(shop); return snapshot ? [[shop, snapshot] as const] : []; })); },
      },
      catalogue,
      now: () => NOW,
    });
    const answers = await service.resolveMany(["free-shop", "pro-shop", "free-shop"], ["export", "seats"]);
    expect([...answers.keys()]).toEqual(["free-shop", "pro-shop"]);
    expect(answers.get("free-shop")?.get("export")).toEqual({ allowed: false, reason: "disabled" });
    expect(answers.get("pro-shop")?.get("export")).toEqual({ allowed: true, kind: "capability" });
    expect(answers.get("pro-shop")?.get("seats")).toEqual({ allowed: true, kind: "capacity" });
    expect(answers.get("free-shop")?.get("seats")).toEqual({ allowed: true, kind: "capacity", maximum: 5 });
    expect(batches).toBe(1);
    expect(singles).toBe(0);
  });

  it("gives exactly the answer `check` gives for the same snapshot", async () => {
    const snapshot = active({ planHandle: "pro", timeZone: "Pacific/Auckland" });
    const service = createEntitlements({ subscriptions: { current: async () => snapshot }, catalogue, now: () => NOW });
    for (const key of ["export", "docs", "seats", "off", "missing", " "]) {
      expect((await service.resolveMany(["shop"], [key])).get("shop")?.get(key)).toEqual(await service.check("shop", key));
    }
  });

  it("falls back to one read per shop when the port has no batch read", async () => {
    const reads: string[] = [];
    const service = createEntitlements({ subscriptions: { current: async (shop) => { reads.push(shop); return active(); } }, catalogue, now: () => NOW });
    const answers = await service.resolveMany(["a", "b"], ["export"]);
    expect(reads).toEqual(["a", "b"]);
    expect(answers.get("b")?.get("export")).toEqual({ allowed: false, reason: "disabled" });
  });

  it("is unavailable for a shop the batch has no answer for, and for a snapshot too old to trust, without refreshing", async () => {
    let refreshes = 0;
    const service = createEntitlements({
      subscriptions: {
        current: async () => active(),
        refresh: async () => { refreshes += 1; return active(); },
        currentForShops: async () => new Map([["stale-shop", active({ verifiedAt: NOW - 3_600_000 })]]),
      },
      catalogue,
      now: () => NOW,
    });
    const answers = await service.resolveMany(["stale-shop", "absent-shop"], ["export"]);
    expect(answers.get("stale-shop")?.get("export")).toEqual({ allowed: false, reason: "subscription_unavailable" });
    expect(answers.get("absent-shop")?.get("export")).toEqual({ allowed: false, reason: "subscription_unavailable" });
    expect(refreshes).toBe(0);
  });

  it("answers blank shops and keys as invalid and reads nothing for an empty list", async () => {
    let reads = 0;
    const service = createEntitlements({ subscriptions: { current: async () => { reads += 1; return active(); }, currentForShops: async () => { reads += 1; return new Map(); } }, catalogue, now: () => NOW });
    expect((await service.resolveMany([" "], ["export"])).get(" ")?.get("export")).toEqual({ allowed: false, reason: "invalid_request" });
    expect(reads).toBe(0);
    expect((await service.resolveMany([], ["export"])).size).toBe(0);
    expect(reads).toBe(0);
  });

  it("writes no cache", async () => {
    let writes = 0;
    const service = createEntitlements({
      subscriptions: { current: async () => active() },
      cache: { get: async () => null, set: async () => { writes += 1; }, invalidate: async () => undefined },
      catalogue,
      now: () => NOW,
    });
    await service.resolveMany(["a", "b"], ["export", "docs"]);
    expect(writes).toBe(0);
  });
});
