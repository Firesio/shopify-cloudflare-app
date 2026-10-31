import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "~/test/db";
import { runWithRequestContext } from "~/request-context.server";
import { ShopRepo } from "~/models/shops.server";
import { DEV_STORE_RECHECK_MS } from "~/domain/dev-store-check";
import { persistDevStoreStatus } from "~/wiring.server";

setupTestDatabase();

const DAY = DEV_STORE_RECHECK_MS;

function shopify(partnerDevelopment: boolean) {
  const requests = { count: 0 };
  return {
    requests,
    admin: {
      graphql: async () => {
        requests.count += 1;
        return new Response(JSON.stringify({ data: { shop: { plan: { partnerDevelopment } } } }));
      },
    },
  };
}

describe("persistDevStoreStatus", () => {
  it("marks a development store, leaves it alone for a day, then clears it once it is on a paid plan", async () => {
    await runWithRequestContext(env, async () => {
      const shops = new ShopRepo();
      await shops.recordInstall("dev.myshopify.com", 1);

      const asDev = shopify(true);
      await expect(persistDevStoreStatus(asDev.admin, "dev.myshopify.com", DAY)).resolves.toBe("changed");
      expect(await shops.get("dev.myshopify.com")).toMatchObject({ isDevStore: true, devStatusCheckedAt: DAY });

      await expect(persistDevStoreStatus(asDev.admin, "dev.myshopify.com", DAY + 1000)).resolves.toBe("skipped");
      expect(asDev.requests.count).toBe(1);

      const paid = shopify(false);
      await expect(persistDevStoreStatus(paid.admin, "dev.myshopify.com", 2 * DAY)).resolves.toBe("changed");
      expect(await shops.get("dev.myshopify.com")).toMatchObject({ isDevStore: false, devStatusCheckedAt: 2 * DAY });
    });
  });

  it("asks once about a real store and never again", async () => {
    await runWithRequestContext(env, async () => {
      const shops = new ShopRepo();
      await shops.recordInstall("real.myshopify.com", 1);
      const real = shopify(false);

      await expect(persistDevStoreStatus(real.admin, "real.myshopify.com", DAY)).resolves.toBe("unchanged");
      await expect(persistDevStoreStatus(real.admin, "real.myshopify.com", 100 * DAY)).resolves.toBe("skipped");
      expect(real.requests.count).toBe(1);
      expect((await shops.get("real.myshopify.com"))?.isDevStore).toBe(false);
    });
  });

  it("only touches the shop it was asked about", async () => {
    await runWithRequestContext(env, async () => {
      const shops = new ShopRepo();
      await shops.recordInstall("a.myshopify.com", 1);
      await shops.recordInstall("b.myshopify.com", 1);

      await persistDevStoreStatus(shopify(true).admin, "a.myshopify.com", DAY);

      expect(await shops.get("a.myshopify.com")).toMatchObject({ isDevStore: true, devStatusCheckedAt: DAY });
      expect(await shops.get("b.myshopify.com")).toMatchObject({ isDevStore: false, devStatusCheckedAt: null });
    });
  });

  it("keeps the stored value, and stays unchecked, on HTTP errors, GraphQL errors and malformed bodies", async () => {
    await runWithRequestContext(env, async () => {
      const shops = new ShopRepo();
      await shops.recordInstall("keep.myshopify.com", 1);
      await shops.recordDevStatus("keep.myshopify.com", true, 0);

      const failures = [
        { graphql: async () => new Response("down", { status: 503 }) },
        { graphql: async () => new Response(JSON.stringify({ errors: [{ message: "denied" }] })) },
        { graphql: async () => new Response(JSON.stringify({ data: { shop: { plan: {} } } })) },
      ];
      for (const admin of failures) {
        await expect(persistDevStoreStatus(admin, "keep.myshopify.com", 5 * DAY)).resolves.toBe("unavailable");
      }
      expect(await shops.get("keep.myshopify.com")).toMatchObject({ isDevStore: true, devStatusCheckedAt: 0 });
    });
  });

  it("does nothing for a shop that has no row", async () => {
    await runWithRequestContext(env, async () => {
      const ghost = shopify(true);
      await expect(persistDevStoreStatus(ghost.admin, "ghost.myshopify.com", DAY)).resolves.toBe("skipped");
      expect(ghost.requests.count).toBe(0);
      expect(await new ShopRepo().get("ghost.myshopify.com")).toBeUndefined();
    });
  });
});
