import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { ShopSubscriptionRepo } from "./shop-subscriptions.server";

setupTestDatabase();

describe("ShopSubscriptionRepo.listCurrentForShops", () => {
  it("lists a shop's current subscription first, the one `currentForShop` returns, however the rows were written", async () => {
    await runWithRequestContext(env, async () => {
      const db = makeDb(env.DB);
      // The older row is written LAST so insertion order cannot explain a correct answer.
      await db.insert(schema.shopSubscriptions).values({ shop: "s.myshopify.com", subscriptionId: "new", status: "NONE", planHandle: null, appliedOccurredAt: 9, appliedExternalId: "e2", revision: 2 }).run();
      await db.insert(schema.shopSubscriptions).values({ shop: "s.myshopify.com", subscriptionId: "old", status: "ACTIVE", planHandle: "pro", appliedOccurredAt: 1, appliedExternalId: "e1", revision: 1 }).run();
      const repo = new ShopSubscriptionRepo();
      const rows = await repo.listCurrentForShops(["s.myshopify.com"]);
      expect(rows[0]).toEqual(await repo.currentForShop("s.myshopify.com"));
      expect(rows[0]).toMatchObject({ status: "NONE", revision: 2 });
    });
  });

  it("keeps each shop's own rows apart", async () => {
    await runWithRequestContext(env, async () => {
      const db = makeDb(env.DB);
      await db.insert(schema.shopSubscriptions).values({ shop: "a.myshopify.com", subscriptionId: "x", status: "ACTIVE", planHandle: "pro", appliedOccurredAt: 1, appliedExternalId: "e", revision: 1 }).run();
      await db.insert(schema.shopSubscriptions).values({ shop: "b.myshopify.com", subscriptionId: "x", status: "FROZEN", planHandle: "pro", appliedOccurredAt: 5, appliedExternalId: "e", revision: 7 }).run();
      const rows = await new ShopSubscriptionRepo().listCurrentForShops(["a.myshopify.com"]);
      expect(rows.map((row) => row.shop)).toEqual(["a.myshopify.com"]);
    });
  });
});
