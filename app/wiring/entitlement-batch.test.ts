import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { monthWindowInZone } from "~/domain/zone-day";
import { PlanGrantsRepo } from "~/models/plan-grants.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { entitlements, subscriptionsPort } from "~/wiring.server";

setupTestDatabase();
const db = () => makeDb(env.DB);
const DAY = 86_400_000;

async function install(shop: string, patch: { status?: "ACTIVE" | "NONE" | "FROZEN"; planHandle?: string | null; revision?: number; timeZone?: string; billing?: boolean; uninstalled?: boolean } = {}) {
  await db().insert(schema.shops).values({
    shop,
    installedAt: 1,
    ...(patch.uninstalled ? { uninstalledAt: 2, relationshipStatus: "UNINSTALLED" as const } : { relationshipStatus: "INSTALLED" as const }),
    ...(patch.timeZone === undefined ? {} : { timeZone: patch.timeZone }),
  }).run();
  if (patch.billing === false) return;
  await db().insert(schema.shopSubscriptions).values({
    shop,
    subscriptionId: "sub",
    status: patch.status ?? "ACTIVE",
    planHandle: patch.planHandle === undefined ? "free" : patch.planHandle,
    appliedOccurredAt: 1,
    appliedExternalId: "evt",
    revision: patch.revision ?? 1,
  }).run();
}

describe("subscriptionsPort.currentForShops", () => {
  it("answers for every shop exactly as `current` does for it", async () => {
    await runWithRequestContext(env, async () => {
      await install("paid.myshopify.com", { planHandle: "pro", revision: 4 });
      await install("zoned.myshopify.com", { timeZone: "Pacific/Auckland" });
      await install("bare.myshopify.com", { billing: false });
      await install("gone.myshopify.com", { uninstalled: true, planHandle: "pro" });
      await install("promo.myshopify.com", { status: "NONE", planHandle: null });
      const now = Date.now();
      await new PlanGrantsRepo().createGrant({ id: "g1", shop: "promo.myshopify.com", planHandle: "pro", reason: "t", grantedBy: "staff", startsAt: now - DAY, expiresAt: now + DAY, createdAt: now });
      const shops = ["paid.myshopify.com", "zoned.myshopify.com", "bare.myshopify.com", "gone.myshopify.com", "promo.myshopify.com", "absent.myshopify.com"];
      const port = subscriptionsPort();
      const batch = await port.currentForShops?.(shops);
      expect(batch).toBeDefined();
      expect([...(batch ?? new Map()).keys()].sort()).toEqual([...shops].sort());
      for (const shop of shops) expect(batch?.get(shop)).toEqual(await port.current(shop));
      expect(batch?.get("paid.myshopify.com")).toMatchObject({ status: "ACTIVE", planHandle: "pro", revision: 4 });
      expect(batch?.get("zoned.myshopify.com")).toMatchObject({ timeZone: "Pacific/Auckland" });
      expect(batch?.get("bare.myshopify.com")?.status).toBe("UNKNOWN");
      expect(batch?.get("gone.myshopify.com")?.status).toBe("UNKNOWN");
      expect(batch?.get("promo.myshopify.com")).toMatchObject({ status: "ACTIVE", planHandle: "pro" });
    });
  });

  it("reads many shops past one statement's bind limit", async () => {
    await runWithRequestContext(env, async () => {
      await install("only.myshopify.com", { planHandle: "pro" });
      const shops = [...Array.from({ length: 205 }, (_, index) => `x-${index}.myshopify.com`), "only.myshopify.com"];
      const batch = await subscriptionsPort().currentForShops?.(shops);
      expect(batch?.size).toBe(206);
      expect(batch?.get("only.myshopify.com")).toMatchObject({ planHandle: "pro" });
    });
  });
});

describe("entitlements() end to end against real D1", () => {
  it("counts a quota in the shop's own month, reports it, and refuses what is left over", async () => {
    await runWithRequestContext(env, async () => {
      await install("quota.myshopify.com", { timeZone: "Pacific/Auckland" });
      const service = entitlements();
      expect(await service.reserve({ shop: "quota.myshopify.com", key: "ai.monthly_tokens", operationId: "op-1", amount: 4000 })).toMatchObject({ allowed: true });
      expect(await service.commit({ shop: "quota.myshopify.com", operationId: "op-1", actualAmount: 3000 })).toMatchObject({ allowed: true, state: "committed" });
      expect(await service.reserve({ shop: "quota.myshopify.com", key: "ai.monthly_tokens", operationId: "op-2", amount: 2000 })).toMatchObject({ allowed: true });
      expect(await service.usage("quota.myshopify.com", "ai.monthly_tokens")).toMatchObject({
        allowed: true,
        kind: "quota",
        window: { key: monthWindowInZone(Date.now(), "Pacific/Auckland").key },
        used: 3000,
        held: 2000,
        maximum: 10_000,
        remaining: 5000,
      });
      expect(await service.reserve({ shop: "quota.myshopify.com", key: "ai.monthly_tokens", operationId: "op-3", amount: 5001 })).toEqual({ allowed: false, reason: "quota_exhausted" });
    });
  });

  it("books existing resources past the plan's maximum, counts them, and refuses a new one", async () => {
    await runWithRequestContext(env, async () => {
      await install("cap.myshopify.com");
      const service = entitlements();
      for (const id of ["project-1", "project-2", "project-3"]) {
        expect(await service.adopt({ shop: "cap.myshopify.com", key: "projects.max", allocationId: id, operationId: `adopt-${id}` })).toMatchObject({ allowed: true, state: "allocated" });
      }
      expect(await service.usage("cap.myshopify.com", "projects.max")).toEqual({ allowed: true, kind: "capacity", used: 3, held: 0, maximum: 1, remaining: 0 });
      expect(await service.allocate({ shop: "cap.myshopify.com", key: "projects.max", allocationId: "project-4", operationId: "new-4" })).toEqual({ allowed: false, reason: "capacity_exhausted" });
    });
  });

  it("answers many shops and keys from one batch, denying a shop that is not installed", async () => {
    await runWithRequestContext(env, async () => {
      await install("a.myshopify.com", { planHandle: "pro" });
      await install("b.myshopify.com");
      const answers = await entitlements().resolveMany(["a.myshopify.com", "b.myshopify.com", "absent.myshopify.com"], ["ai.reply_draft", "projects.max"]);
      expect(answers.get("a.myshopify.com")?.get("projects.max")).toEqual({ allowed: true, kind: "capacity", maximum: 10 });
      expect(answers.get("b.myshopify.com")?.get("projects.max")).toEqual({ allowed: true, kind: "capacity", maximum: 1 });
      expect(answers.get("absent.myshopify.com")?.get("ai.reply_draft")).toEqual({ allowed: false, reason: "inactive_subscription" });
    });
  });
});
