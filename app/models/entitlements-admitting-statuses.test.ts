import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeClock } from "~/test/fake-runtime";
import { EntitlementRepo } from "./entitlements.server";

setupTestDatabase();
const clock = fakeClock();

type Status = "NONE" | "PENDING" | "ACTIVE" | "CANCELLATION_SCHEDULED" | "FROZEN" | "CANCELED" | "UNKNOWN";
async function seed(shop: string, status: Status, revision = 1) {
  await makeDb(env.DB).insert(schema.shopSubscriptions).values({ shop, subscriptionId: "sub", status, appliedOccurredAt: 1, appliedExternalId: "evt", revision }).run();
}
const slot = (shop: string, revision = 1) => ({ shop, key: "seats", allocationId: "a", operationId: "op-a", maximum: 1, subscriptionRevision: revision });
const quota = (shop: string, revision = 1) => ({ shop, key: "docs", operationId: "q", period: "lifetime", amount: 1, maximum: 1, subscriptionRevision: revision });

/**
 * The model re-checks, at write time, that the snapshot a decision was made from is still current. Which stored states count as
 * "may allocate and reserve" is the app's reading of billing: an app that treats a lapsed subscription as the free plan lists those
 * states; the default is the policy's own (NONE, ACTIVE, CANCELLATION_SCHEDULED).
 */
describe("EntitlementRepo admitting statuses", () => {
  it.each(["PENDING", "FROZEN", "CANCELED", "UNKNOWN"] as const)("refuses %s by default", async (status) => {
    await runWithRequestContext(env, async () => {
      await seed("default", status);
      const repo = new EntitlementRepo(clock);
      expect(await repo.allocate(slot("default"))).toEqual({ allowed: false, reason: "capacity_exhausted" });
      expect(await repo.reserve(quota("default"))).toEqual({ allowed: false, reason: "quota_exhausted" });
    });
  });

  it("admits a status the app lists, for allocate and reserve", async () => {
    await runWithRequestContext(env, async () => {
      await seed("lapsed", "FROZEN");
      const repo = new EntitlementRepo(clock, { admittingStatuses: ["NONE", "ACTIVE", "CANCELLATION_SCHEDULED", "FROZEN"] });
      expect(await repo.allocate(slot("lapsed"))).toMatchObject({ allowed: true });
      expect(await repo.reserve(quota("lapsed"))).toMatchObject({ allowed: true });
    });
  });

  it("still refuses a status the app does not list, and a stale revision whatever the status", async () => {
    await runWithRequestContext(env, async () => {
      await seed("pending", "PENDING");
      await seed("revised", "FROZEN", 5);
      const repo = new EntitlementRepo(clock, { admittingStatuses: ["NONE", "ACTIVE", "CANCELLATION_SCHEDULED", "FROZEN"] });
      expect(await repo.allocate(slot("pending"))).toEqual({ allowed: false, reason: "capacity_exhausted" });
      expect(await repo.allocate(slot("revised", 4))).toEqual({ allowed: false, reason: "conflict" });
      expect(await repo.reserve(quota("revised", 4))).toEqual({ allowed: false, reason: "operation_conflict" });
    });
  });

  it("leaves a shop with no subscription row to the revision-0 rule", async () => {
    await runWithRequestContext(env, async () => {
      const repo = new EntitlementRepo(clock, { admittingStatuses: ["ACTIVE"] });
      expect(await repo.allocate(slot("fresh", 0))).toMatchObject({ allowed: true });
      expect(await repo.reserve(quota("fresh", 0))).toMatchObject({ allowed: true });
    });
  });

  it("holds the maximum for a listed status all the same", async () => {
    await runWithRequestContext(env, async () => {
      await seed("full", "FROZEN");
      const repo = new EntitlementRepo(clock, { admittingStatuses: ["FROZEN"] });
      expect(await repo.allocate(slot("full"))).toMatchObject({ allowed: true });
      expect(await repo.allocate({ ...slot("full"), allocationId: "b", operationId: "op-b" })).toEqual({ allowed: false, reason: "capacity_exhausted" });
    });
  });
});
