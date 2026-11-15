import { env, exports } from "cloudflare:workers";
import { signedWebhookRequest } from "@firesio/app/shopify/testing";
import { callCommand, openTicketResultSchema } from "@firesio/portal-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { identity } from "~/core/identity";
import { setupTestDatabase } from "~/test/database";
import { deliver, installShop, recordSends, type Settlement } from "~/test/e2e";

setupTestDatabase();
afterEach(() => vi.restoreAllMocks());

const SECRET = "test-api-secret";
const QUEUE = `${identity.slug}-webhooks`;
const account = (id: string) => ({ kind: "shopify_shop", id }) as const;

/** A delivery the way Shopify makes it, POSTed to the Worker's own `fetch` at the URI the shopify.app.toml files subscribe. */
const post = (over: { path: string; topic: string; shop: string; webhookId: string; payload?: unknown; badHmac?: boolean }) =>
  signedWebhookRequest({
    url: `https://example.test${over.path}`,
    topic: over.topic,
    shop: over.shop,
    payload: over.payload ?? {},
    secret: SECRET,
    webhookId: over.webhookId,
    eventId: `event-${over.webhookId}`,
    ...(over.badHmac === true ? { badHmac: true } : {}),
  }).then((request) => exports.default.fetch(request));

async function count(sql: string, ...values: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...values).first();
  const n = row?.["n"];
  return typeof n === "number" ? n : -1;
}

async function outboxTypes(shop: string): Promise<string[]> {
  const rows = await env.DB.prepare(`SELECT type FROM portal_outbox WHERE account_id = ?1 ORDER BY created_at, event_id`).bind(shop).all();
  return rows.results.flatMap((row) => (typeof row["type"] === "string" ? [row["type"]] : []));
}

/** Shopify delivers the same webhook again (same webhook id): over HTTP, through the queue, to the consumer. */
async function redeliver(sent: { bodies: () => unknown[] }, request: () => Promise<Response>): Promise<Settlement> {
  const before = sent.bodies().length;
  expect((await request()).status).toBe(200);
  expect(sent.bodies()).toHaveLength(before + 1);
  return deliver(QUEUE, sent.bodies().slice(before));
}

describe("app/uninstalled, from the HTTP request to the D1 effect, through the real Worker", () => {
  const shop = "e2e-uninstall.myshopify.com";
  const uninstall = () => post({ path: "/webhooks/app/uninstalled", topic: "app/uninstalled", shop, webhookId: "wh-uninstall-1", payload: { id: 1, domain: shop } });

  it("is a 200 with one queued message and nothing in D1; the consumer marks the shop uninstalled and queues shop.uninstalled for the portal", async () => {
    await installShop(shop, 1_700_000_000_000);
    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await uninstall()).status).toBe(200);
    expect(sent.bodies()).toHaveLength(1);
    // The request itself wrote nothing: the consumer owns the inbox.
    expect(await count(`SELECT COUNT(*) AS n FROM webhook_deliveries`)).toBe(0);
    expect((await env.DB.prepare(`SELECT relationship_status FROM shops WHERE shop = ?1`).bind(shop).first())?.["relationship_status"]).not.toBe("UNINSTALLED");

    expect(await deliver(QUEUE, sent.bodies())).toMatchObject({ acked: ["msg-0"], retried: [], retriedAll: 0 });
    const shopRow = await env.DB.prepare(`SELECT relationship_status, uninstalled_at FROM shops WHERE shop = ?1`).bind(shop).first();
    expect(shopRow?.["relationship_status"]).toBe("UNINSTALLED");
    expect(typeof shopRow?.["uninstalled_at"]).toBe("number");
    expect(await outboxTypes(shop)).toEqual(["shop.installed", "shop.uninstalled"]);
    const outbox = await env.DB.prepare(`SELECT status, account_kind, event_id FROM portal_outbox WHERE type = 'shop.uninstalled' AND account_id = ?1`).bind(shop).first();
    expect(outbox).toMatchObject({ status: "pending", account_kind: "shopify_shop", event_id: "uninstall_wh-uninstall-1" });
    expect(await count(`SELECT COUNT(*) AS n FROM webhook_deliveries WHERE shop = ?1 AND status = 'processed'`, shop)).toBe(1);
  });

  it("changes nothing when Shopify delivers it a second time", async () => {
    await installShop(shop, 1_700_000_000_000);
    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await uninstall()).status).toBe(200);
    await deliver(QUEUE, sent.bodies());
    const before = await env.DB.prepare(`SELECT uninstalled_at FROM shops WHERE shop = ?1`).bind(shop).first();

    expect(await redeliver(sent, uninstall)).toMatchObject({ acked: ["msg-0"], retried: [] });
    expect(await outboxTypes(shop)).toEqual(["shop.installed", "shop.uninstalled"]);
    expect(await count(`SELECT COUNT(*) AS n FROM webhook_deliveries WHERE shop = ?1`, shop)).toBe(1);
    expect((await env.DB.prepare(`SELECT uninstalled_at FROM shops WHERE shop = ?1`).bind(shop).first())?.["uninstalled_at"]).toBe(before?.["uninstalled_at"]);
  });
});

describe("a delivery that is not for the Worker's consumer", () => {
  it("is a 401 with nothing queued for a bad signature, for a topic the Worker runs and for one it does not", async () => {
    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await post({ path: "/webhooks/app/uninstalled", topic: "app/uninstalled", shop: "e2e-bad.myshopify.com", webhookId: "wh-bad-1", badHmac: true })).status).toBe(401);
    expect((await post({ path: "/webhooks/orders/create", topic: "orders/create", shop: "e2e-bad.myshopify.com", webhookId: "wh-bad-2", badHmac: true })).status).toBe(401);
    expect(sent.bodies()).toEqual([]);
  });

  it("is a 200 with nothing queued for a verified topic nobody handles", async () => {
    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await post({ path: "/webhooks/orders/create", topic: "orders/create", shop: "e2e-orders.myshopify.com", webhookId: "wh-orders-1" })).status).toBe(200);
    expect(sent.bodies()).toEqual([]);
  });
});

describe("the Worker's queue handler", () => {
  it("retries, never acknowledges, a batch addressed to a consumer this Worker does not have", async () => {
    expect(await deliver("some-other-queue", [{ anything: true }])).toEqual({ acked: [], retried: [], retriedAll: 1 });
  });
});

const ERASED = ["shops", "support_tickets", "support_messages", "shop_plan_grants"] as const;

/** A shop with rows in several tables: its install, a ticket with its message and a plan gift. */
async function seedShop(shop: string): Promise<void> {
  await installShop(shop, 1_700_000_000_000);
  const ticket = await callCommand(() => env.PORTAL_ADMIN_API.support().open({ account: account(shop), requestId: `req-${shop}`, subject: "Hello", body: "A message", category: "question", actor: "staff_1" }), openTicketResultSchema);
  expect(ticket.ok).toBe(true);
  expect(await env.PORTAL_ADMIN_API.billing().grantPlan({ account: account(shop), planId: "free", reason: "e2e", actor: "staff_1" })).toMatchObject({ ok: true });
}

const rowsOf = (table: string, shop: string) => count(`SELECT COUNT(*) AS n FROM ${table} WHERE shop = ?1`, shop);

describe("shop/redact, from the HTTP request to the D1 effect, through the real Worker", () => {
  const shop = "e2e-redact.myshopify.com";
  const bystander = "e2e-bystander.myshopify.com";
  const redact = () => post({ path: "/webhooks/compliance", topic: "shop/redact", shop, webhookId: "wh-redact-1", payload: { shop_id: 1, shop_domain: shop } });

  it("erases the shop's rows in every table, leaves a tombstone and the account.redacted event, and spares another shop", async () => {
    await seedShop(shop);
    await seedShop(bystander);
    for (const table of ERASED) expect(await rowsOf(table, shop), table).toBeGreaterThan(0);

    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await redact()).status).toBe(200);
    expect(sent.bodies()).toHaveLength(1);
    expect(await deliver(QUEUE, sent.bodies())).toMatchObject({ acked: ["msg-0"], retried: [] });

    for (const table of ERASED) {
      expect(await rowsOf(table, shop), table).toBe(0);
      expect(await rowsOf(table, bystander), `${table} of another shop`).toBeGreaterThan(0);
    }
    expect(await outboxTypes(shop)).toEqual(["account.redacted"]);
    expect(await outboxTypes(bystander)).toContain("shop.installed");
    expect(await count(`SELECT COUNT(*) AS n FROM redacted_shops`)).toBe(1);
    expect(await rowsOf("webhook_deliveries", shop)).toBe(0);
  });

  it("changes nothing when Shopify delivers it a second time", async () => {
    await seedShop(shop);
    const sent = recordSends(env.WEBHOOK_QUEUE);
    expect((await redact()).status).toBe(200);
    await deliver(QUEUE, sent.bodies());

    expect(await redeliver(sent, redact)).toMatchObject({ acked: ["msg-0"], retried: [] });
    expect(await outboxTypes(shop)).toEqual(["account.redacted"]);
    expect(await count(`SELECT COUNT(*) AS n FROM redacted_shops`)).toBe(1);
    expect(await rowsOf("shops", shop)).toBe(0);
  });
});
