import { afterEach, describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { WebhookDeliveryRepo } from "~/models/webhook-deliveries.server";
import { KVSessionStorage } from "~/session-storage.server";
import { offlineSession, signedWebhookRequest } from "~/test/factories";
import { ShopRepo } from "~/models/shops.server";
import { consumeWebhook } from "~/services/webhook-consumer";
import { captureWebhookQueue, failWebhookQueue } from "~/test/webhook-queue";
import { webhookConsumer } from "~/wiring.server";
import { action } from "./uninstalled";

setupTestDatabase();
afterEach(() => vi.restoreAllMocks());

const WEBHOOK_URL = "https://example.test/webhooks/app/uninstalled";

function inRequest<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(env, fn);
}

function post(request: Request) {
  return inRequest(() =>
    action({
      request,
      params: {},
      url: new URL(request.url),
      pattern: "/webhooks/app/uninstalled",
      context: new RouterContextProvider(),
    }),
  );
}

describe("app/uninstalled webhook", () => {
  it("rejects an invalid HMAC with 401, not a swallowed success", async () => {
    const request = await signedWebhookRequest({
      url: WEBHOOK_URL,
      topic: "app/uninstalled",
      shop: "bad-hmac.myshopify.com",
      payload: {},
      badHmac: true,
    });

    await expect(post(request)).rejects.toMatchObject({ status: 401 });
  });

  it("accepts the uninstall when the stored offline session has an expired token (Shopify rejects the refresh once uninstalled)", async () => {
    const shop = "expired-session.myshopify.com";
    const sent = captureWebhookQueue();
    await inRequest(async () => {
      await new KVSessionStorage(env.SESSION).storeSession(offlineSession(shop, { expires: new Date(Date.now() - 60_000), refreshToken: "revoked-refresh-token" }));
    });
    const response = await post(await signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/uninstalled", shop, payload: {}, webhookId: "wh-expired" }));
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ shop, id: "wh-expired", intake: { topic: "app/uninstalled" } });
  });

  it("acknowledges after one queue message and writes nothing to D1 in the request", async () => {
    const shop = "uninstalled.myshopify.com";
    const sent = captureWebhookQueue();
    await inRequest(async () => {
      await new KVSessionStorage(env.SESSION).storeSession(offlineSession(shop));
    });

    const response = await post(await signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/uninstalled", shop, payload: {} }));

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    // Admission (the inbox row) is the consumer's step; the request must not depend on D1 to answer Shopify.
    expect(await inRequest(() => new WebhookDeliveryRepo().get(shop, "webhook-id-1"))).toBeUndefined();
  });

  it("answers 5xx when the queue refuses the message, so Shopify retries instead of losing the delivery", async () => {
    failWebhookQueue();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = await signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/uninstalled", shop: "queue-down.myshopify.com", payload: {} });
    await expect(post(request)).rejects.toThrow("queue unavailable");
  });

  it("is idempotent — a replayed delivery produces exactly one inbox row and one processed effect", async () => {
    const shop = "replayed-uninstall.myshopify.com";
    const sent = captureWebhookQueue();
    await inRequest(async () => {
      await new ShopRepo().recordInstall(shop, 1);
      await new KVSessionStorage(env.SESSION).storeSession(offlineSession(shop));
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const request = () => signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/uninstalled", shop, payload: {} });
    // Deliveries are at-least-once: Shopify retried, so the same webhook id produced two messages.
    expect((await post(await request())).status).toBe(200);
    expect((await post(await request())).status).toBe(200);
    expect(sent).toHaveLength(2);

    const results = await inRequest(async () => {
      const outcomes = [];
      for (const message of sent) outcomes.push(await consumeWebhook(webhookConsumer(), message));
      return outcomes;
    });
    expect(results).toEqual([{ outcome: "processed", topic: "app/uninstalled" }, { outcome: "duplicate", topic: "app/uninstalled" }]);
    expect(await inRequest(() => new WebhookDeliveryRepo().listForShop(shop))).toHaveLength(1);
  });

  describe("during a client-secret rotation", () => {
    const postWithPrevious = (request: Request, previous: string) => runWithRequestContext(Object.assign({}, env, { SHOPIFY_API_SECRET_PREVIOUS: previous }), () =>
      action({ request, params: {}, url: new URL(request.url), pattern: "/webhooks/app/uninstalled", context: new RouterContextProvider() }));
    const deliver = (secret: string, webhookId: string) => signedWebhookRequest({ url: WEBHOOK_URL, topic: "app/uninstalled", shop: "rotating.myshopify.com", payload: {}, secret, webhookId });

    it("accepts a delivery signed with the previous secret, and still the current one", async () => {
      expect((await postWithPrevious(await deliver("the-old-secret", "rot-old"), "the-old-secret")).status).toBe(200);
      expect((await postWithPrevious(await deliver("test-api-secret", "rot-new"), "the-old-secret")).status).toBe(200);
    });

    it("answers 401 for a secret that is neither, and for the old secret when no previous secret is configured", async () => {
      await expect(postWithPrevious(await deliver("someone-else", "rot-bad"), "the-old-secret")).rejects.toMatchObject({ status: 401 });
      await expect(post(await deliver("the-old-secret", "rot-unset"))).rejects.toMatchObject({ status: 401 });
    });

    it("ignores an empty previous secret", async () => {
      await expect(postWithPrevious(await deliver("test-api-secret", "rot-empty-ok"), "")).resolves.toMatchObject({ status: 200 });
      await expect(postWithPrevious(await deliver("someone-else", "rot-empty-bad"), "")).rejects.toMatchObject({ status: 401 });
    });
  });
});
