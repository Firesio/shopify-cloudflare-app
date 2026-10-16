import { afterEach, describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { runWithRequestContext } from "~/request-context.server";
import { KVSessionStorage } from "~/session-storage.server";
import { offlineSession, signedWebhookRequest } from "~/test/factories";
import { setupTestDatabase } from "~/test/db";
import { WebhookDeliveryRepo } from "~/models/webhook-deliveries.server";
import { ShopRepo } from "~/models/shops.server";
import { WebhookScopeObservationRepo } from "~/models/webhook-scope-observations.server";
import { consumeWebhook } from "~/services/webhook-consumer";
import { captureWebhookQueue } from "~/test/webhook-queue";
import { webhookConsumer } from "~/wiring.server";
import { action } from "./scopes-update";

const WEBHOOK_URL = "https://example.test/webhooks/app/scopes_update";

setupTestDatabase();
afterEach(() => vi.restoreAllMocks());

function post(request: Request) {
  return runWithRequestContext(env, () =>
    action({
      request,
      params: {},
      url: new URL(request.url),
      pattern: "/webhooks/app/scopes_update",
      context: new RouterContextProvider(),
    }),
  );
}

describe("app/scopes_update webhook", () => {
  it("rejects an invalid HMAC with 401, not a swallowed success", async () => {
    const request = await signedWebhookRequest({
      url: WEBHOOK_URL,
      topic: "app/scopes_update",
      shop: "bad-hmac.myshopify.com",
      payload: { current: ["read_products"] },
      badHmac: true,
    });

    await expect(post(request)).rejects.toMatchObject({ status: 401 });
  });

  it("carries the normalized scope set on the queue message and writes nothing to D1 itself", async () => {
    const shop = "scopes-update.myshopify.com";
    const sent = captureWebhookQueue();
    await new KVSessionStorage(env.SESSION).storeSession(offlineSession(shop, { scope: "read_products" }));

    const response = await post(await signedWebhookRequest({
      url: WEBHOOK_URL, topic: "app/scopes_update", shop, payload: { current: ["write_products", "read_products", "read_products"] },
    }));

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ shop, id: "webhook-id-1", intake: { topic: "app/scopes_update", scopes: ["read_products", "write_products"] } });
    expect(await runWithRequestContext(env, () => new WebhookDeliveryRepo().get(shop, "webhook-id-1"))).toBeUndefined();
  });

  it("applies the scope set once when the consumer sees the same delivery twice", async () => {
    const shop = "scopes-replay.myshopify.com";
    const sent = captureWebhookQueue();
    await runWithRequestContext(env, async () => {
      await new ShopRepo().recordInstall(shop, 1);
      await new KVSessionStorage(env.SESSION).storeSession(offlineSession(shop, { scope: "read_products" }));
    });
    const request = () => signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/scopes_update", shop, payload: { current: ["read_products", "write_products"] } });
    await post(await request());
    await post(await request());

    const results = await runWithRequestContext(env, async () => {
      const outcomes = [];
      for (const message of sent) outcomes.push((await consumeWebhook(webhookConsumer(), message)).outcome);
      return outcomes;
    });

    expect(results).toEqual(["processed", "duplicate"]);
    expect(await runWithRequestContext(env, () => new WebhookScopeObservationRepo().listGrantedForShop(shop))).toEqual(["read_products", "write_products"]);
    expect((await new KVSessionStorage(env.SESSION).loadSession(`offline_${shop}`))?.scope).toBe("read_products,write_products");
  });

  it("leaves the stored session untouched when the payload is malformed", async () => {
    const shop = "malformed-scopes.myshopify.com";
    const storage = new KVSessionStorage(env.SESSION);
    await storage.storeSession(offlineSession(shop, { scope: "read_products" }));

    // `current` missing entirely — a shape Shopify would never
    // reject (it only checks the HMAC), so the route itself must guard it.
    const request = await signedWebhookRequest({
      url: WEBHOOK_URL,
      topic: "app/scopes_update",
      shop,
      payload: { updated_at: "2024-10-01T00:00:00.000Z" },
    });

    await expect(post(request)).rejects.toMatchObject({ status: 400 });

    const stored = await storage.loadSession(`offline_${shop}`);
    expect(stored?.scope).toBe("read_products");
  });
});
