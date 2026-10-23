import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { fakeClock } from "~/test/fake-runtime";
import { EntitlementRepo } from "./entitlements.server";

setupTestDatabase();
const clock = fakeClock();

async function seed(shop: string, status: "NONE" | "ACTIVE" | "FROZEN" = "ACTIVE", revision = 1) {
  await makeDb(env.DB).insert(schema.shopSubscriptions).values({ shop, subscriptionId: "sub", status, appliedOccurredAt: 1, appliedExternalId: "evt", revision }).run();
}
const quota = (shop: string, operationId: string, amount = 1, revision = 1) => ({ shop, key: "docs", operationId, period: "2026-03", amount, maximum: 100, subscriptionRevision: revision });
const slot = (shop: string, allocationId: string, revision = 1) => ({ shop, key: "seats", allocationId, operationId: `op-${allocationId}`, maximum: 2, subscriptionRevision: revision });

describe("EntitlementRepo.readUsage", () => {
  it("is zero for a period nothing was reserved in", async () => {
    await runWithRequestContext(env, async () => {
      expect(await new EntitlementRepo(clock).readUsage("quiet", "docs", "2026-03")).toEqual({ committed: 0, held: 0 });
    });
  });

  it("separates what was committed from what is still held, per period", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      const repo = new EntitlementRepo(clock);
      await repo.reserve(quota("s", "a", 3));
      await repo.commit({ shop: "s", operationId: "a", actualAmount: 2 });
      await repo.reserve(quota("s", "b", 5));
      await repo.reserve({ ...quota("s", "c", 7), period: "2026-04" });
      expect(await repo.readUsage("s", "docs", "2026-03")).toEqual({ committed: 2, held: 5 });
      expect(await repo.readUsage("s", "docs", "2026-04")).toEqual({ committed: 0, held: 7 });
      await repo.release({ shop: "s", operationId: "b" });
      expect(await repo.readUsage("s", "docs", "2026-03")).toEqual({ committed: 2, held: 0 });
    });
  });

  it("never reads another shop's usage", async () => {
    await runWithRequestContext(env, async () => {
      await seed("mine");
      await seed("theirs");
      const repo = new EntitlementRepo(clock);
      await repo.reserve(quota("theirs", "a", 9));
      expect(await repo.readUsage("mine", "docs", "2026-03")).toEqual({ committed: 0, held: 0 });
    });
  });
});

describe("EntitlementRepo.readAllocations", () => {
  it("counts held and allocated slots apart and ignores released ones", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      const repo = new EntitlementRepo(clock);
      await repo.allocate(slot("s", "a"));
      await repo.confirmAllocation({ shop: "s", key: "seats", allocationId: "a", operationId: "op-a" });
      await repo.allocate(slot("s", "b"));
      expect(await repo.readAllocations("s", "seats")).toEqual({ allocated: 1, held: 1 });
      await repo.deallocate({ shop: "s", key: "seats", allocationId: "a", operationId: "op-a" });
      expect(await repo.readAllocations("s", "seats")).toEqual({ allocated: 0, held: 1 });
    });
  });

  it("is zero for a shop with none and never counts another shop's", async () => {
    await runWithRequestContext(env, async () => {
      await seed("theirs");
      const repo = new EntitlementRepo(clock);
      await repo.allocate(slot("theirs", "a"));
      expect(await repo.readAllocations("mine", "seats")).toEqual({ allocated: 0, held: 0 });
    });
  });
});

describe("EntitlementRepo.adopt", () => {
  const adopt = (shop: string, allocationId: string, operationId = `adopt-${allocationId}`, revision = 1) => ({ shop, key: "seats", allocationId, operationId, subscriptionRevision: revision });

  it("records an existing resource as allocated, beyond the maximum a plan now allows", async () => {
    await runWithRequestContext(env, async () => {
      await seed("over");
      const repo = new EntitlementRepo(clock);
      for (const id of ["a", "b", "c"]) expect(await repo.adopt(adopt("over", id))).toMatchObject({ allowed: true, state: "allocated" });
      expect(await repo.readAllocations("over", "seats")).toEqual({ allocated: 3, held: 0 });
      // The slots are counted, so the ordinary path refuses a fourth.
      expect(await repo.allocate({ ...slot("over", "d"), maximum: 2 })).toEqual({ allowed: false, reason: "capacity_exhausted" });
    });
  });

  it("works for a shop with no subscription row and for any projection status: it books a fact, it grants nothing", async () => {
    await runWithRequestContext(env, async () => {
      await seed("frozen", "FROZEN");
      const repo = new EntitlementRepo(clock);
      expect(await repo.adopt(adopt("fresh", "a", "adopt-a", 0))).toMatchObject({ allowed: true, state: "allocated" });
      expect(await repo.adopt(adopt("frozen", "a"))).toMatchObject({ allowed: true, state: "allocated" });
    });
  });

  it("is idempotent: the same operation, or the same resource under another operation, adds no second slot", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      const repo = new EntitlementRepo(clock);
      await repo.adopt(adopt("s", "a"));
      expect(await repo.adopt(adopt("s", "a"))).toMatchObject({ allowed: true, state: "allocated", replayed: true });
      expect(await repo.adopt(adopt("s", "a", "another-operation"))).toMatchObject({ allowed: true, state: "allocated", replayed: true });
      expect(await repo.readAllocations("s", "seats")).toEqual({ allocated: 1, held: 0 });
    });
  });

  it("is idempotent under concurrent retries", async () => {
    await runWithRequestContext(env, async () => {
      await seed("race");
      const repo = new EntitlementRepo(clock);
      const results = await Promise.all([repo.adopt(adopt("race", "a")), repo.adopt(adopt("race", "a")), repo.adopt(adopt("race", "a", "other"))]);
      expect(results.every((result) => result.allowed)).toBe(true);
      expect(await repo.readAllocations("race", "seats")).toEqual({ allocated: 1, held: 0 });
    });
  });

  it("refuses an operation id already used for another resource or key", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      const repo = new EntitlementRepo(clock);
      await repo.adopt(adopt("s", "a", "shared"));
      expect(await repo.adopt(adopt("s", "b", "shared"))).toEqual({ allowed: false, reason: "operation_conflict" });
      expect(await repo.adopt({ ...adopt("s", "a", "shared"), key: "other" })).toEqual({ allowed: false, reason: "operation_conflict" });
    });
  });

  it("promotes a held attempt of the same resource and refuses a released operation", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      const repo = new EntitlementRepo(clock);
      await repo.allocate(slot("s", "a"));
      expect(await repo.adopt(adopt("s", "a", "op-a"))).toMatchObject({ allowed: true, state: "allocated" });
      await repo.deallocate({ shop: "s", key: "seats", allocationId: "a", operationId: "op-a" });
      expect(await repo.adopt(adopt("s", "a", "op-a"))).toEqual({ allowed: false, reason: "invalid_state" });
      // The resource itself may be adopted again under a new operation once its slot was released.
      expect(await repo.adopt(adopt("s", "a", "op-a-again"))).toMatchObject({ allowed: true, state: "allocated" });
    });
  });

  it("refuses a resource another operation holds, and never touches another shop", async () => {
    await runWithRequestContext(env, async () => {
      await seed("s");
      await seed("t");
      const repo = new EntitlementRepo(clock);
      await repo.allocate(slot("s", "a"));
      expect(await repo.adopt(adopt("s", "a", "different-op"))).toEqual({ allowed: false, reason: "operation_conflict" });
      expect(await repo.adopt(adopt("t", "a"))).toMatchObject({ allowed: true, state: "allocated" });
      const rows = await makeDb(env.DB).select({ state: schema.entitlementAllocations.state }).from(schema.entitlementAllocations).where(and(eq(schema.entitlementAllocations.shop, "s"), eq(schema.entitlementAllocations.allocationId, "a"))).all();
      expect(rows).toEqual([{ state: "held" }]);
    });
  });
});
