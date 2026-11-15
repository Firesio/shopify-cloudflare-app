import { env } from "cloudflare:workers";
import { signedWebhookRequest } from "@firesio/app/shopify/testing";
import { RouterContextProvider, type ActionFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { setupSendRecording } from "~/test/sends";
import { action, loader } from "./receive";

setupTestDatabase();
const record = setupSendRecording();

// The secret of the test environment (vitest.config.ts).
const SECRET = "test-api-secret";
const SHOP = "receive-one.myshopify.com";

const signed = (over: { topic?: string; badHmac?: boolean; url?: string; secret?: string } = {}) =>
  signedWebhookRequest({ url: over.url ?? "https://example.test/webhooks/app/uninstalled", topic: over.topic ?? "app/uninstalled", shop: SHOP, payload: { id: 1 }, secret: over.secret ?? SECRET, ...(over.badHmac === true ? { badHmac: true } : {}) });

/** What React Router hands the action: the real route function is called with the whole argument object. */
const args = (request: Request): ActionFunctionArgs => ({ request, url: new URL(request.url), pattern: "/webhooks/*", params: {}, context: new RouterContextProvider() });

describe("the webhook receiver (one line: firesio.webhook(request), every topic)", () => {
  it("answers 200 for a verified topic the preset runs, with ONE message on the queue and nothing in D1", async () => {
    const sent = record(env.WEBHOOK_QUEUE);
    const response = await action(args(await signed()));
    expect(response.status).toBe(200);
    expect(sent.bodies()).toHaveLength(1);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM webhook_deliveries`).first();
    expect(rows?.["n"]).toBe(0);
  });

  it("answers 401 for a bad signature on a topic the preset runs, and queues nothing", async () => {
    const sent = record(env.WEBHOOK_QUEUE);
    expect((await action(args(await signed({ badHmac: true })))).status).toBe(401);
    expect(sent.bodies()).toEqual([]);
  });

  it("answers 401 for a bad signature on a topic nobody handles (an app-review check: an unsigned POST is never a 200), and queues nothing", async () => {
    const sent = record(env.WEBHOOK_QUEUE);
    expect((await action(args(await signed({ topic: "orders/create", url: "https://example.test/webhooks/orders/create", badHmac: true })))).status).toBe(401);
    expect(sent.bodies()).toEqual([]);
  });

  it("answers 200 for a good signature on a topic nobody handles, and queues nothing", async () => {
    const sent = record(env.WEBHOOK_QUEUE);
    const response = await action(args(await signed({ topic: "orders/create", url: "https://example.test/webhooks/orders/create" })));
    expect(response.status).toBe(200);
    expect(sent.bodies()).toEqual([]);
  });

  it("answers 401 to a request with no signature at all, whatever the topic", async () => {
    const request = new Request("https://example.test/webhooks/orders/create", { method: "POST", body: "{}", headers: { "x-shopify-topic": "orders/create", "x-shopify-shop-domain": SHOP } });
    expect((await action(args(request))).status).toBe(401);
  });

  it("refuses a delivery for a host that is not a shop", async () => {
    const request = await signedWebhookRequest({ url: "https://example.test/webhooks/compliance", topic: "shop/redact", shop: "evil.example.com", payload: {}, secret: SECRET });
    expect((await action(args(request))).status).toBeGreaterThanOrEqual(400);
  });

  it("refuses a delivery signed with a secret that is neither the current one nor SHOPIFY_API_SECRET_PREVIOUS", async () => {
    expect((await action(args(await signed({ secret: "an-old-secret" })))).status).toBe(401);
  });

  it("answers a GET with 405", () => {
    expect(loader().status).toBe(405);
  });
});
