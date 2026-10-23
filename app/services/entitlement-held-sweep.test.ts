import { describe, expect, it, vi } from "vitest";
import { HELD_MAX_AGE_MS, HELD_SWEEP_BATCH } from "~/domain/entitlement-held";
import type { HeldDecision, HeldItem, ReconciliationResult } from "~/ports/entitlement-reconciliation";
import { sweepHeldEntitlements } from "./entitlement-held-sweep";

const NOW = 10_000_000;

const quota = (shop: string, id: string, createdAt = 1): HeldItem => ({ kind: "quota", shop, key: "exports", id, period: "2026-10", amount: 2, createdAt });
const capacity = (shop: string, id: string, createdAt = 1): HeldItem => ({ kind: "capacity", shop, key: "staff.max", id, operationId: `op-${id}`, createdAt });

function fakes(items: readonly HeldItem[], result: (item: HeldItem, decision: string) => ReconciliationResult = (item, decision) =>
  ({ state: decision === "commit" ? "committed" : decision === "confirm" ? "allocated" : "released" })) {
  const listed: Array<{ cutoff: number; limit: number }> = [];
  const applied: string[] = [];
  return {
    listed,
    applied,
    deps: {
      listExpired: async (cutoff: number, limit: number) => { listed.push({ cutoff, limit }); return items; },
      apply: async (shop: string, item: HeldItem, decision: "commit" | "release" | "confirm") => {
        applied.push(`${shop}:${item.kind}:${item.id}:${decision}`);
        return result(item, decision);
      },
    },
  };
}

describe("sweepHeldEntitlements", () => {
  it("asks for what was created at least the default maximum age ago, one default batch", async () => {
    const { listed, deps } = fakes([]);
    await sweepHeldEntitlements(deps, NOW);
    expect(listed).toEqual([{ cutoff: NOW - HELD_MAX_AGE_MS, limit: HELD_SWEEP_BATCH }]);
  });

  it("releases every expired quota reservation and capacity allocation of every shop, each under its own shop", async () => {
    const { applied, deps } = fakes([quota("shop-a", "q1"), capacity("shop-b", "c1"), quota("shop-b", "q2")]);
    const result = await sweepHeldEntitlements(deps, NOW);
    expect(applied.sort()).toEqual(["shop-a:quota:q1:release", "shop-b:capacity:c1:release", "shop-b:quota:q2:release"]);
    expect(result).toEqual({ examined: 3, released: 3, committed: 0, allocated: 0, failed: 0, backlog: 0 });
  });

  it("uses an app's own decision, including a commit with a measured amount, and leaves ignored items held", async () => {
    const { applied, deps } = fakes([quota("shop-a", "finished"), quota("shop-a", "running"), capacity("shop-a", "staff-1")]);
    const decide = (item: HeldItem): HeldDecision =>
      item.id === "finished" ? "commit" : item.id === "staff-1" ? "confirm" : "ignore";
    const result = await sweepHeldEntitlements({ ...deps, decide }, NOW);
    expect(applied.sort()).toEqual(["shop-a:capacity:staff-1:confirm", "shop-a:quota:finished:commit"]);
    expect(result).toMatchObject({ examined: 3, committed: 1, allocated: 1, released: 0, failed: 0 });
  });

  it("passes the maximum age the app chose to the list and to the default decision", async () => {
    const { listed, applied, deps } = fakes([quota("shop-a", "q1", NOW - 61_000)]);
    await sweepHeldEntitlements({ ...deps, maxAgeMs: 60_000 }, NOW);
    expect(listed).toEqual([{ cutoff: NOW - 60_000, limit: HELD_SWEEP_BATCH }]);
    expect(applied).toEqual(["shop-a:quota:q1:release"]);
  });

  it("leaves an item that the list returned but is younger than the maximum age", async () => {
    const { applied, deps } = fakes([quota("shop-a", "young", NOW - 1_000)]);
    const result = await sweepHeldEntitlements(deps, NOW);
    expect(applied).toEqual([]);
    expect(result).toMatchObject({ examined: 1, released: 0 });
  });

  it("counts a refused settlement and still settles the rest", async () => {
    const { applied, deps } = fakes([quota("shop-a", "stuck"), quota("shop-a", "fine"), quota("shop-b", "other")], (item) =>
      item.id === "stuck" ? { reason: "invalid_state" } : { state: "released" });
    const result = await sweepHeldEntitlements(deps, NOW);
    expect(applied).toHaveLength(3);
    expect(result).toMatchObject({ examined: 3, released: 2, failed: 1 });
  });

  it("does not let one shop's thrown error stop the other shops, and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const applied: string[] = [];
      const result = await sweepHeldEntitlements({
        listExpired: async () => [quota("shop-a", "q1"), quota("shop-b", "q2")],
        apply: async (shop, item) => {
          if (shop === "shop-a") throw new Error("D1 unavailable");
          applied.push(`${shop}:${item.id}`);
          return { state: "released" };
        },
      }, NOW);
      expect(applied).toEqual(["shop-b:q2"]);
      expect(result).toMatchObject({ examined: 2, released: 1, failed: 1 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"entitlements.held_sweep_shop_failed"'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"shop":"shop-a"'));
    } finally {
      error.mockRestore();
    }
  });

  it("reports a backlog when the batch came back full", async () => {
    const items = Array.from({ length: 3 }, (_, index) => quota("shop-a", `q${index}`));
    const { deps } = fakes(items);
    expect(await sweepHeldEntitlements({ ...deps, limit: 3 }, NOW)).toMatchObject({ examined: 3, backlog: 1 });
    expect(await sweepHeldEntitlements({ ...deps, limit: 4 }, NOW)).toMatchObject({ examined: 3, backlog: 0 });
  });
});
