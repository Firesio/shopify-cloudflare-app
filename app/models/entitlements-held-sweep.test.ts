import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import {
  expiredCapacityQuery,
  expiredQuotaQuery,
  HeldSweepRepo,
} from "./entitlement-held-sweep.server";

setupTestDatabase();

type State = "held" | "committed" | "released" | "allocated";

async function operation(shop: string, id: string, createdAt: number, state: Exclude<State, "allocated"> = "held") {
  await makeDb(env.DB).insert(schema.entitlementOperations).values({
    shop, operationId: id, key: "exports", period: "2026-10", requestedAmount: 2, reservedAmount: 2,
    actualAmount: state === "committed" ? 2 : null, subscriptionRevision: 1, state, createdAt, updatedAt: createdAt,
  }).run();
}

async function allocation(shop: string, id: string, createdAt: number, state: Exclude<State, "committed"> = "held") {
  await makeDb(env.DB).insert(schema.entitlementAllocations).values({
    shop, key: "staff.max", allocationId: id, operationId: `op-${id}`, subscriptionRevision: 1, state, createdAt, updatedAt: createdAt,
  }).run();
}

const listed = (cutoff: number, limit: number) =>
  runWithRequestContext(env, () => new HeldSweepRepo().listExpired(cutoff, limit));

describe("HeldSweepRepo.listExpired", () => {
  it("lists held quota and capacity of every shop at or before the cutoff, oldest first", async () => {
    await operation("shop-a", "quota-new", 300);
    await operation("shop-a", "quota-old", 100);
    await allocation("shop-b", "staff-mid", 200);
    await allocation("shop-b", "staff-future", 301);
    expect(await listed(300, 10)).toEqual([
      { kind: "quota", shop: "shop-a", key: "exports", id: "quota-old", period: "2026-10", amount: 2, createdAt: 100 },
      { kind: "capacity", shop: "shop-b", key: "staff.max", id: "staff-mid", operationId: "op-staff-mid", createdAt: 200 },
      { kind: "quota", shop: "shop-a", key: "exports", id: "quota-new", period: "2026-10", amount: 2, createdAt: 300 },
    ]);
  });

  it("leaves out everything that is no longer held", async () => {
    await operation("shop-a", "committed", 1, "committed");
    await operation("shop-a", "released", 2, "released");
    await allocation("shop-a", "allocated", 3, "allocated");
    await allocation("shop-a", "released", 4, "released");
    expect(await listed(1_000, 10)).toEqual([]);
  });

  it("keeps the oldest items across both kinds when the limit cuts the batch", async () => {
    await operation("shop-a", "q1", 10);
    await operation("shop-a", "q3", 30);
    await allocation("shop-b", "c2", 20);
    await allocation("shop-b", "c4", 40);
    const items = await listed(1_000, 3);
    expect(items.map((item) => item.id)).toEqual(["q1", "c2", "q3"]);
  });

  it("returns nothing for a zero limit", async () => {
    await operation("shop-a", "q1", 10);
    expect(await listed(1_000, 0)).toEqual([]);
  });
});

// A held row is rare, but the tables keep every settled row forever: a sweep that scanned them would read the whole
// history of every shop each tick (@rules/merchant-speed.md).
describe("held sweep query plans", () => {
  async function planOf(query: { toSQL(): { sql: string; params: unknown[] } }): Promise<string> {
    const { sql, params } = query.toSQL();
    const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params).all<{ detail: string }>();
    return rows.results.map((row) => row.detail).join(" | ");
  }

  it("reads held quota through a partial index, not a table scan", async () => {
    const plan = await runWithRequestContext(env, () => planOf(expiredQuotaQuery(1_000, 10)));
    expect(plan).toContain("entitlement_operations_held_idx");
    expect(plan).not.toMatch(/SCAN entitlement_operations(?! USING)/);
  });

  it("reads held capacity through a partial index, not a table scan", async () => {
    const plan = await runWithRequestContext(env, () => planOf(expiredCapacityQuery(1_000, 10)));
    expect(plan).toContain("entitlement_allocations_held_idx");
    expect(plan).not.toMatch(/SCAN entitlement_allocations(?! USING)/);
  });
});
