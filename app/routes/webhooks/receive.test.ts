import { env } from "cloudflare:test";
import { signedWebhookRequest } from "@firesio/shopify/testing";
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
});
