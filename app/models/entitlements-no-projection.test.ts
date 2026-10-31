import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeClock } from "~/test/fake-runtime";
import { EntitlementRepo } from "./entitlements.server";

setupTestDatabase();

/**
 * A shop that has never had a subscription observed has NO `shop_subscriptions` row. An app whose port reads that as
 * "no subscription yet, the free plan" hands the model revision 0; the model must admit that snapshot (and only
 * that one) so a free shop can allocate and reserve. A port that reads it as UNKNOWN never reaches the model.
 */
const clock = fakeClock();
const capacity = (shop: string, id: string, revision = 0) => ({ shop, key: "staff", allocationId: id, operationId: `op-${id}`, maximum: 1, subscriptionRevision: revision });
const quota = (shop: string, id: string, revision = 0) => ({ shop, key: "exports", operationId: id, period: "lifetime", amount: 1, maximum: 1, subscriptionRevision: revision });

async function seed(shop: string, status: "NONE" | "ACTIVE" | "FROZEN", revision: number) {
  await makeDb(env.DB).insert(schema.shopSubscriptions).values({ shop, subscriptionId: "sub", status, appliedOccurredAt: 1, appliedExternalId: "evt", revision }).run();
}

describe("EntitlementRepo for a shop with no subscription row", () => {
  it("allocates and reserves at revision 0 and still enforces the maximum", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(capacity("fresh", "a"))).toMatchObject({ allowed: true, state: "held", remaining: 0 });
      expect(await repo.allocate(capacity("fresh", "b"))).toEqual({ allowed: false, reason: "capacity_exhausted" });
      expect(await repo.reserve(quota("fresh", "q1"))).toMatchObject({ allowed: true, state: "held", remaining: 0 });
      expect(await repo.reserve(quota("fresh", "q2"))).toEqual({ allowed: false, reason: "quota_exhausted" });
    });
  });

  it("does not admit a non-zero revision when there is no row", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(capacity("fresh", "a", 1))).toEqual({ allowed: false, reason: "capacity_exhausted" });
      expect(await repo.reserve(quota("fresh", "q1", 1))).toEqual({ allowed: false, reason: "quota_exhausted" });
    });
  });

  it("refuses revision 0 once a projection row exists: that snapshot is stale", async () => {
    await runWithRequestContext(env, async () => {
      await seed("stale", "ACTIVE", 3);
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(capacity("stale", "a"))).toEqual({ allowed: false, reason: "conflict" });
      expect(await repo.reserve(quota("stale", "q1"))).toEqual({ allowed: false, reason: "operation_conflict" });
    });
  });

  it("keeps shops apart: one shop's slot and usage never count toward another's", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(capacity("shop-a", "a"))).toMatchObject({ allowed: true });
      expect(await repo.allocate(capacity("shop-b", "a"))).toMatchObject({ allowed: true });
      expect(await repo.reserve(quota("shop-a", "q1"))).toMatchObject({ allowed: true });
      expect(await repo.reserve(quota("shop-b", "q1"))).toMatchObject({ allowed: true });
    });
  });

  it("admits exactly one of two concurrent allocations and reservations at a limit of one", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new EntitlementRepo(clock);
      const allocations = await Promise.all([repo.allocate(capacity("race", "a")), repo.allocate(capacity("race", "b"))]);
      expect(allocations.filter((result) => result.allowed)).toHaveLength(1);
      const reservations = await Promise.all([repo.reserve(quota("race", "q1")), repo.reserve(quota("race", "q2"))]);
      expect(reservations.filter((result) => result.allowed)).toHaveLength(1);
    });
  });
});

describe("EntitlementRepo status guard", () => {
  it("reserves quota for a shop whose projection is NONE, as it already allocates", async () => {
    await runWithRequestContext(env, async () => {
      await seed("none", "NONE", 1);
      expect(await new EntitlementRepo(clock).reserve(quota("none", "q1", 1))).toMatchObject({ allowed: true });
    });
  });

  it("still refuses a FROZEN projection for both operations", async () => {
    await runWithRequestContext(env, async () => {
      await seed("frozen", "FROZEN", 1);
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(capacity("frozen", "a", 1))).toEqual({ allowed: false, reason: "capacity_exhausted" });
      expect(await repo.reserve(quota("frozen", "q1", 1))).toEqual({ allowed: false, reason: "quota_exhausted" });
    });
  });
});
