import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { d1Metrics, d1OpenTicketCount } from "./d1-metrics";

setupTestDatabase();

const DAY = "2026-11-14";
const START = Date.parse(`${DAY}T00:00:00Z`);

async function addShop(shop: string, installedAt: number, status: string, isDev = 0, uninstalledAt: number | null = null): Promise<void> {
  await env.DB.prepare(`INSERT INTO shops (shop, installed_at, relationship_status, is_dev_store, uninstalled_at) VALUES (?1, ?2, ?3, ?4, ?5)`).bind(shop, installedAt, status, isDev, uninstalledAt).run();
}

describe("the daily counts", () => {
  it("counts installs and uninstalls inside the UTC day, and leaves development stores out", async () => {
    await addShop("a.myshopify.com", START + 1, "INSTALLED");
    await addShop("b.myshopify.com", START - 1, "UNINSTALLED", 0, START + 5);
    await addShop("c.myshopify.com", START + 2, "INSTALLED", 1);
    const metrics = d1Metrics(env.DB);
    expect(await metrics.installedOn(DAY)).toBe(1);
    expect(await metrics.uninstalledOn(DAY)).toBe(1);
    expect(await metrics.activeShops()).toBe(1);
  });

  it("groups paying shops by plan: active and cancellation-scheduled pay, a frozen or dev shop does not", async () => {
    await addShop("a.myshopify.com", START, "INSTALLED");
    await addShop("b.myshopify.com", START, "INSTALLED");
    await addShop("c.myshopify.com", START, "INSTALLED", 1);
    await addShop("d.myshopify.com", START, "INSTALLED");
    const subscribe = (shop: string, status: string) =>
      env.DB.prepare(`INSERT INTO shop_subscriptions (shop, status, plan_handle, applied_occurred_at, applied_external_id, updated_at) VALUES (?1, ?2, 'pro', 1, 'x', 1)`).bind(shop, status).run();
    await subscribe("a.myshopify.com", "ACTIVE");
    await subscribe("b.myshopify.com", "CANCELLATION_SCHEDULED");
    await subscribe("c.myshopify.com", "ACTIVE");
    await subscribe("d.myshopify.com", "FROZEN");
    expect(await d1Metrics(env.DB).payingShopsByPlan()).toEqual({ pro: 2 });
  });

  it("counts open tickets of one shop only", async () => {
    const ticket = (id: string, shop: string, closedAt: number | null) =>
      env.DB.prepare(`INSERT INTO support_tickets (id, shop, source, shop_name, category, subject, last_author, last_message_at, closed_at, created_at) VALUES (?1, ?2, 'app_portal', 'n', 'bug', 's', 'merchant', 1, ?3, ?4)`).bind(id, shop, closedAt, START + 1).run();
    await ticket("t1", "a.myshopify.com", null);
    await ticket("t2", "a.myshopify.com", 5);
    await ticket("t3", "b.myshopify.com", null);
    expect(await d1OpenTicketCount(env.DB)("a.myshopify.com")).toBe(1);
    expect(await d1Metrics(env.DB).openTickets()).toBe(2);
    expect(await d1Metrics(env.DB).ticketsCreatedOn(DAY)).toBe(3);
  });
});
