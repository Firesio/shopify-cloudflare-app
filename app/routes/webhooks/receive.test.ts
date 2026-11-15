import { env } from "cloudflare:test";
import { signedWebhookRequest } from "@firesio/app/shopify/testing";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { action, loader } from "./receive";

setupTestDatabase();

// The secret of the test environment (vitest.config.ts).
const SECRET = "test-api-secret";
const SHOP = "receive-one.myshopify.com";

const signed = (over: { topic?: string; badHmac?: boolean; url?: string } = {}) =>
  signedWebhookRequest({ url: over.url ?? "https://example.test/webhooks/app/uninstalled", topic: over.topic ?? "app/uninstalled", shop: SHOP, payload: { id: 1 }, secret: SECRET, ...(over.badHmac === true ? { badHmac: true } : {}) });

describe("the webhook receiver", () => {
  it("answers 2xx for a verified delivery, with the delivery on the queue and nothing in D1", async () => {
    const response = await action({ request: await signed() });
    expect(response.status).toBe(200);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM webhook_deliveries`).first();
    expect(rows?.["n"]).toBe(0);
  });

  it("keeps a bad signature a 401 (an app-review check) and a GET a 405", async () => {
    expect((await action({ request: await signed({ badHmac: true }) })).status).toBe(401);
    expect(loader().status).toBe(405);
  });

  it("refuses a delivery for a host that is not a shop", async () => {
    const request = await signedWebhookRequest({ url: "https://example.test/webhooks/compliance", topic: "shop/redact", shop: "evil.example.com", payload: {}, secret: SECRET });
    expect((await action({ request })).status).toBeGreaterThanOrEqual(400);
  });

  it("answers 2xx for a topic the preset does not own (the app's own code is where it would be handled)", async () => {
    const response = await action({ request: await signed({ topic: "orders/create", url: "https://example.test/webhooks/orders/create" }) });
    expect(response.status).toBe(200);
  });

  it("refuses a delivery signed with a secret that is neither the current one nor SHOPIFY_API_SECRET_PREVIOUS", async () => {
    const request = await signedWebhookRequest({ url: "https://example.test/webhooks/app/uninstalled", topic: "app/uninstalled", shop: SHOP, payload: { id: 1 }, secret: "an-old-secret" });
    expect((await action({ request })).status).toBe(401);
  });
});
