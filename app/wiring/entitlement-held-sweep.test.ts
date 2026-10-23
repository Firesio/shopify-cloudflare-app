import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { HELD_MAX_AGE_MS } from "~/domain/entitlement-held";
import { EntitlementRepo } from "~/models/entitlements.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeClock } from "~/test/fake-runtime";
import * as wiring from "~/wiring.server";

setupTestDatabase();

const NOW = 1_800_000_000_000;
const OLD = NOW - HELD_MAX_AGE_MS - 1;
const YOUNG = NOW - 60_000;

async function seedShop(shop: string, createdAt: number) {
  const db = makeDb(env.DB);
  await db.insert(schema.shopSubscriptions).values({ shop, subscriptionId: "subscription", status: "ACTIVE", appliedOccurredAt: 1, appliedExternalId: "event", revision: 1 }).run();
  const reserved = await new EntitlementRepo(fakeClock(createdAt)).reserve({ shop, key: "exports", operationId: "quota-1", period: "lifetime", amount: 2, maximum: 5, subscriptionRevision: 1, now: createdAt });
  expect(reserved).toMatchObject({ allowed: true, state: "held" });
  await db.insert(schema.entitlementAllocations).values({ shop, key: "staff.max", allocationId: "staff-1", operationId: "capacity-1", subscriptionRevision: 1, state: "held", createdAt, updatedAt: createdAt }).run();
}

const usageOf = (shop: string) => makeDb(env.DB).select({ committed: schema.entitlementUsage.committed, held: schema.entitlementUsage.held }).from(schema.entitlementUsage).where(eq(schema.entitlementUsage.shop, shop)).get();
const operationState = (shop: string) => makeDb(env.DB).select({ state: schema.entitlementOperations.state }).from(schema.entitlementOperations).where(and(eq(schema.entitlementOperations.shop, shop), eq(schema.entitlementOperations.operationId, "quota-1"))).get();
const allocationState = (shop: string) => makeDb(env.DB).select({ state: schema.entitlementAllocations.state }).from(schema.entitlementAllocations).where(eq(schema.entitlementAllocations.shop, shop)).get();

describe("wired held-entitlement sweep", () => {
  it("releases what crashed runs left held, frees the quota and the slot, and leaves other shops' young items alone", async () => {
    await runWithRequestContext(env, async () => {
      await seedShop("crashed.myshopify.com", OLD);
      await seedShop("running.myshopify.com", YOUNG);
      expect(await usageOf("crashed.myshopify.com")).toEqual({ committed: 0, held: 2 });

      const result = await wiring.entitlementHeldSweep().run(NOW);

      expect(result).toEqual({ examined: 2, released: 2, committed: 0, allocated: 0, failed: 0, backlog: 0 });
      expect(await operationState("crashed.myshopify.com")).toEqual({ state: "released" });
      expect(await allocationState("crashed.myshopify.com")).toEqual({ state: "released" });
      expect(await usageOf("crashed.myshopify.com")).toEqual({ committed: 0, held: 0 });
      // Another shop's in-flight work is untouched.
      expect(await operationState("running.myshopify.com")).toEqual({ state: "held" });
      expect(await allocationState("running.myshopify.com")).toEqual({ state: "held" });
      expect(await usageOf("running.myshopify.com")).toEqual({ committed: 0, held: 2 });
    });
  });

  it("settles a stuck item once: a second tick finds nothing and changes nothing", async () => {
    await runWithRequestContext(env, async () => {
      await seedShop("replay.myshopify.com", OLD);
      await wiring.entitlementHeldSweep().run(NOW);
      expect(await wiring.entitlementHeldSweep().run(NOW + 1)).toEqual({ examined: 0, released: 0, committed: 0, allocated: 0, failed: 0, backlog: 0 });
      expect(await usageOf("replay.myshopify.com")).toEqual({ committed: 0, held: 0 });
    });
  });

  it("does not release an item a caller already committed or confirmed", async () => {
    await runWithRequestContext(env, async () => {
      await seedShop("settled.myshopify.com", OLD);
      const repo = new EntitlementRepo(fakeClock(NOW));
      expect(await repo.commit({ shop: "settled.myshopify.com", operationId: "quota-1" })).toEqual({ state: "committed" });
      await repo.confirmAllocation({ shop: "settled.myshopify.com", key: "staff.max", allocationId: "staff-1", operationId: "capacity-1" });

      expect(await wiring.entitlementHeldSweep().run(NOW)).toMatchObject({ examined: 0, released: 0 });
      expect(await operationState("settled.myshopify.com")).toEqual({ state: "committed" });
      expect(await allocationState("settled.myshopify.com")).toEqual({ state: "allocated" });
      expect(await usageOf("settled.myshopify.com")).toEqual({ committed: 2, held: 0 });
    });
  });
});
