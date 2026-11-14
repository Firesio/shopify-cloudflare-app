import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { afterAuth } from "~/core/shops/after-auth";
import { recordInstall } from "~/core/shops/lifecycle";
import { consumeWebhooks } from "~/core/webhooks/consume";
import { setupTestDatabase } from "~/test/database";
import { outboxEvents } from "~/test/outbox";
import { consumeDeps } from "./scheduled";
import { createServices } from "./services";

setupTestDatabase();

const GONE = "redact-gone.myshopify.com";
const KEPT = "redact-kept.myshopify.com";
const T0 = 1_700_000_000_000;

const redactMessage = (shop: string, id: string) => ({ shop, id, intake: { topic: "shop/redact", eventId: `e-${id}`, apiVersion: "2026-10", triggeredAt: T0, receivedAt: T0, payloadHash: "h" } });
const consume = (...bodies: unknown[]) => consumeWebhooks(consumeDeps(createServices(env)), { messages: bodies.map((body) => ({ body, ack: () => undefined, retry: () => undefined })) });

/** One row per shop-keyed table, so a purge that forgets a table leaves a visible row. */
async function seed(shop: string): Promise<void> {
  const run = (sql: string, ...values: unknown[]) => env.DB.prepare(sql).bind(...values).run();
  await recordInstall(createServices(env).lifecycle, shop, T0);
  await run(`INSERT INTO shop_subscriptions (shop, status, plan_handle, applied_occurred_at, applied_external_id, updated_at) VALUES (?1, 'ACTIVE', 'pro', 1, 'x', 1)`, shop);
  await run(`INSERT INTO shop_plan_grants (id, shop, plan_handle, reason, granted_by, starts_at, expires_at, created_at) VALUES (?1, ?2, 'pro', 'r', 'g', 1, 2, 1)`, `grant-${shop}`, shop);
  await run(`INSERT INTO notification_preferences (scope, event, channel, enabled, updated_at) VALUES (?1, 'e', 'email', 1, 1)`, shop);
  await run(`INSERT INTO shop_members (id, shop, shopify_user_id, email, role, status, account_owner, collaborator, created_at, updated_at) VALUES (?1, ?2, '1', 'a@b.org', 'owner', 'active', 1, 0, 1, 1)`, `member-${shop}`, shop);
  await run(`INSERT INTO plan_usage (subject, counter, period, used, expires_at) VALUES (?1, 'mail.daily', '2026-11-14', 1, 9)`, shop);
  await run(`INSERT INTO support_tickets (id, shop, source, shop_name, category, subject, last_author, last_message_at, created_at) VALUES (?1, ?2, 'app_portal', 'n', 'bug', 's', 'merchant', 1, 1)`, `ticket-${shop}`, shop);
}

async function rowsOf(shop: string): Promise<number> {
  const tables: readonly [string, string][] = [["shops", "shop"], ["shop_subscriptions", "shop"], ["shop_plan_grants", "shop"], ["notification_preferences", "scope"], ["shop_members", "shop"], ["plan_usage", "subject"], ["support_tickets", "shop"]];
  let total = 0;
  for (const [table, column] of tables) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?1`).bind(shop).first();
    total += typeof row?.["n"] === "number" ? row["n"] : 0;
  }
  return total;
}

describe("shop/redact", () => {
  it("erases the shop's rows in every table, keeps another shop's, and leaves one fact: account.redacted", async () => {
    await seed(GONE);
    await seed(KEPT);
    await consume(redactMessage(GONE, "r1"));
    expect(await rowsOf(GONE)).toBe(0);
    expect(await rowsOf(KEPT)).toBeGreaterThan(0);
    const events = await outboxEvents();
    expect(events.filter((event) => event.accountId === GONE).map((event) => event.type)).toEqual(["account.redacted"]);
    expect(events.filter((event) => event.accountId === KEPT).map((event) => event.type)).toEqual(["shop.installed"]);
  });

  it("holds no domain in the tombstone, and drops a later delivery for the shop without storing it", async () => {
    await seed(GONE);
    await consume(redactMessage(GONE, "r2"));
    const tombstones = await env.DB.prepare(`SELECT shop_hash FROM redacted_shops`).all();
    expect(tombstones.results).toHaveLength(1);
    expect(JSON.stringify(tombstones.results)).not.toContain("redact-gone");
    await consume({ ...redactMessage(GONE, "r3"), intake: { ...redactMessage(GONE, "r3").intake, topic: "app/uninstalled" } });
    const stored = await env.DB.prepare(`SELECT COUNT(*) AS n FROM webhook_deliveries WHERE shop = ?1`).bind(GONE).first();
    expect(stored?.["n"]).toBe(0);
  });

  it("is idempotent: a redelivery after the commit changes nothing and emits nothing more", async () => {
    await seed(GONE);
    await consume(redactMessage(GONE, "r4"));
    await consume(redactMessage(GONE, "r5"));
    expect((await outboxEvents()).filter((event) => event.type === "account.redacted")).toHaveLength(1);
  });

  it("answers customers/data_request and customers/redact on the record: the template stores no customer data", async () => {
    const message = (topic: string, id: string) => ({ ...redactMessage(KEPT, id), intake: { ...redactMessage(KEPT, id).intake, topic } });
    await consume(message("customers/data_request", "c1"), message("customers/redact", "c2"));
    const rows = await env.DB.prepare(`SELECT id, status FROM webhook_deliveries ORDER BY id`).all();
    expect(rows.results).toEqual([{ id: "c1", status: "processed" }, { id: "c2", status: "processed" }]);
  });
});

describe("a merchant installing again", () => {
  it("lifts the redaction tombstone, so the shop works again", async () => {
    await seed(GONE);
    await consume(redactMessage(GONE, "r6"));
    const s = createServices(env);
    expect(await s.redaction.isSuppressed(GONE, "webhook_delivery")).toBe(true);
    await afterAuth({ ...s.afterAuthDeps, afterResponse: () => undefined }, { shop: GONE });
    expect(await s.redaction.isSuppressed(GONE, "webhook_delivery")).toBe(false);
    expect((await s.shops.get(GONE))?.relationshipStatus).toBe("INSTALLED");
  });
});
