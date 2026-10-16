import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ShopRepo } from "~/models/shops.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { invalidateEntitlements } from "~/wiring/entitlement-cache.server";
import { subscriptionsPort } from "~/wiring/billing.server";

setupTestDatabase();

const SHOP = "memo-shop.myshopify.com";

describe("the subscription snapshot within one request", () => {
  it("is read once however many entitlement checks ask, and again after an invalidation", async () => {
    const result = await runWithRequestContext(env, async () => {
      const port = subscriptionsPort();
      const first = await port.current(SHOP);
      await new ShopRepo().recordInstall(SHOP, 1_000); // a change the memo must not see until it is told
      const second = await port.current(SHOP);
      await invalidateEntitlements(SHOP);
      const third = await port.current(SHOP);
      return { first, second, third };
    });

    expect(result.second).toBe(result.first);
    expect(result.first.status).toBe("UNKNOWN");
    expect(result.third).not.toBe(result.first);
  });

  it("is never shared with another shop or another request", async () => {
    const [one, two] = await Promise.all([
      runWithRequestContext(env, () => subscriptionsPort().current("shop-one.myshopify.com")),
      runWithRequestContext(env, () => subscriptionsPort().current("shop-two.myshopify.com")),
    ]);
    expect(one).not.toBe(two);
  });
});
