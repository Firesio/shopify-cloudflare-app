import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { PlanGrantsRepo } from "./plan-grants.server";
import { ShopRepo } from "./shops.server";

setupTestDatabase();

const NOW = 1_000_000;
const DAY = 86_400_000;
const repo = new PlanGrantsRepo();
let sequence = 0;

async function grant(shop: string, patch: { planHandle?: string; startsAt?: number; expiresAt?: number; revokedAt?: number | null } = {}) {
  sequence += 1;
  await new ShopRepo().recordInstall(shop, NOW);
  await repo.createGrant({
    id: `grant-${sequence}`,
    shop,
    planHandle: patch.planHandle ?? "pro",
    reason: "test",
    grantedBy: "staff",
    startsAt: patch.startsAt ?? NOW - DAY,
    expiresAt: patch.expiresAt ?? NOW + DAY,
    createdAt: NOW,
  });
  if (patch.revokedAt != null) await repo.revokeGrant(shop, `grant-${sequence}`, "staff", patch.revokedAt);
}

describe("PlanGrantsRepo.findActiveGrants", () => {
  it("returns the active grant of each shop asked for, and nothing for a shop without one", async () => {
    await runWithRequestContext(env, async () => {
      await grant("a.myshopify.com", { planHandle: "pro" });
      await grant("b.myshopify.com", { planHandle: "scale" });
      await new ShopRepo().recordInstall("none.myshopify.com", NOW);
      const found = await repo.findActiveGrants(["a.myshopify.com", "b.myshopify.com", "none.myshopify.com", "never.myshopify.com"], NOW);
      expect([...found.keys()].sort()).toEqual(["a.myshopify.com", "b.myshopify.com"]);
      expect(found.get("b.myshopify.com")?.planHandle).toBe("scale");
    });
  });

  it("ignores a grant that has expired, not started or been revoked", async () => {
    await runWithRequestContext(env, async () => {
      await grant("expired.myshopify.com", { expiresAt: NOW });
      await grant("future.myshopify.com", { startsAt: NOW + 1, expiresAt: NOW + DAY });
      await grant("revoked.myshopify.com", { revokedAt: NOW - 1 });
      const found = await repo.findActiveGrants(["expired.myshopify.com", "future.myshopify.com", "revoked.myshopify.com"], NOW);
      expect(found.size).toBe(0);
    });
  });

  it("picks the grant that ends last, as findActiveGrant does for one shop", async () => {
    await runWithRequestContext(env, async () => {
      await grant("two.myshopify.com", { planHandle: "pro", expiresAt: NOW + DAY });
      await grant("two.myshopify.com", { planHandle: "scale", expiresAt: NOW + 5 * DAY });
      const found = await repo.findActiveGrants(["two.myshopify.com"], NOW);
      expect(found.get("two.myshopify.com")?.planHandle).toBe("scale");
      expect(found.get("two.myshopify.com")?.planHandle).toBe((await repo.findActiveGrant("two.myshopify.com", NOW))?.planHandle);
    });
  });

  it("reads more shops than one statement can bind, and never another shop's grant", async () => {
    await runWithRequestContext(env, async () => {
      const shops = Array.from({ length: 205 }, (_, index) => `bulk-${index}.myshopify.com`);
      await grant(shops[0] ?? "", { planHandle: "pro" });
      await grant(shops[204] ?? "", { planHandle: "scale" });
      await grant("outsider.myshopify.com", { planHandle: "pro" });
      const found = await repo.findActiveGrants(shops, NOW);
      expect([...found.keys()].sort()).toEqual([shops[0], shops[204]].sort());
    });
  });

  it("is empty for no shops", async () => {
    await runWithRequestContext(env, async () => {
      expect((await repo.findActiveGrants([], NOW)).size).toBe(0);
    });
  });
});
