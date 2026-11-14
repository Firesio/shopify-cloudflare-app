import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { outboxEvents } from "~/test/outbox";
import { createServices } from "~/wiring/services";
import { afterAuth, type AfterAuthDeps, type ShopFactsPort } from "./after-auth";

setupTestDatabase();

const SHOP = "auth-one.myshopify.com";
const T0 = 1_700_000_000_000;

const facts: ShopFactsPort = {
  identity: async () => ({ shopifyShopId: "gid://shopify/Shop/1", name: "Auth One", email: "owner@example.org", contactEmail: null, url: null }),
  settings: async () => ({ timeZone: "Asia/Ho_Chi_Minh", isDevStore: true }),
};

function harness(over: Partial<AfterAuthDeps> = {}) {
  const background: Promise<void>[] = [];
  const refreshed: string[] = [];
  const cleared: string[] = [];
  const base = createServices(env).afterAuthDeps;
  const deps: AfterAuthDeps = {
    ...base,
    facts,
    now: () => T0,
    clearRedaction: async (shop) => { cleared.push(shop); return false; },
    refreshSubscription: async (shop) => void refreshed.push(shop.domain),
    afterResponse: (task) => void background.push(task),
    ...over,
  };
  return { deps, settle: () => Promise.all(background), refreshed, cleared };
}

describe("afterAuth", () => {
  it("lifts a redaction first, records the install and its event, and decorates in the background", async () => {
    const { deps, settle, refreshed, cleared } = harness();
    await afterAuth(deps, { shop: SHOP, accessToken: "token" });
    expect(cleared).toEqual([SHOP]);
    expect((await outboxEvents()).map((event) => event.type)).toEqual(["shop.installed"]);
    await settle();
    const shop = await createServices(env).shops.get(SHOP);
    expect(shop).toMatchObject({ name: "Auth One", shopifyShopId: "gid://shopify/Shop/1", timeZone: "Asia/Ho_Chi_Minh" });
    expect(refreshed).toEqual([SHOP]);
    const dev = await env.DB.prepare(`SELECT is_dev_store FROM shops WHERE shop = ?1`).bind(SHOP).first();
    expect(dev?.["is_dev_store"]).toBe(1);
  });

  it("still installs the shop when Shopify does not answer, and never throws from the background", async () => {
    const { deps, settle, refreshed } = harness({ facts: { identity: async () => null, settings: async () => null } });
    await afterAuth(deps, { shop: SHOP, accessToken: "token" });
    await settle();
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("INSTALLED");
    expect(refreshed).toEqual([SHOP]);
  });

  it("a failing decoration is logged, not thrown", async () => {
    const logged: string[] = [];
    const { deps, settle } = harness({ log: (entry) => void logged.push(String(entry["event"])), facts: { identity: async () => { throw new Error("down"); }, settings: async () => null } });
    await afterAuth(deps, { shop: SHOP, accessToken: "token" });
    await settle();
    expect(logged).toContain("shop.after_auth_background_failed");
  });

  it("does no background work without an offline token", async () => {
    const { deps, settle, refreshed } = harness();
    await afterAuth(deps, { shop: SHOP });
    await settle();
    expect(refreshed).toEqual([]);
  });
});
