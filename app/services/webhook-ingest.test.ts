import { describe, expect, it } from "vitest";
import type { QueuedWebhook } from "~/ports/webhook-queue";
import { enqueueWebhook, parseTriggeredAt, sha256Json, type AuthenticatedWebhook, type WebhookEnqueueDependencies } from "./webhook-ingest";

const webhook: AuthenticatedWebhook = {
  webhookId: "delivery-1", eventId: "event-1", topic: "app/uninstalled", shop: "example.myshopify.com",
  apiVersion: "2026-10", triggeredAt: 100, receivedAt: 200, payload: { shop_id: 1 },
};

function dependencies(overrides: Partial<WebhookEnqueueDependencies> = {}): WebhookEnqueueDependencies & { readonly sent: QueuedWebhook[] } {
  const sent: QueuedWebhook[] = [];
  return {
    now: () => 1_000,
    queue: { async send(message) { sent.push(message); } },
    hashPayload: async () => "a".repeat(64),
    sent,
    ...overrides,
  };
}

describe("enqueueWebhook", () => {
  it("puts one message on the queue carrying everything the consumer needs to write the inbox row", async () => {
    const deps = dependencies();
    await enqueueWebhook(deps, webhook);
    expect(deps.sent).toEqual([{
      shop: "example.myshopify.com",
      id: "delivery-1",
      intake: { topic: "app/uninstalled", eventId: "event-1", apiVersion: "2026-10", triggeredAt: 100, receivedAt: 200, payloadHash: "a".repeat(64), scopes: [] },
    }]);
  });

  it("normalizes Shopify enum webhook topics for the consumer registry", async () => {
    const deps = dependencies();
    await enqueueWebhook(deps, { ...webhook, topic: "APP_UNINSTALLED" });
    await enqueueWebhook(deps, { ...webhook, topic: "SHOP_REDACT" });
    expect(deps.sent.map((message) => message.intake?.topic)).toEqual(["app/uninstalled", "shop/redact"]);
  });

  it("forwards the typed scope values sorted and de-duplicated, never the payload", async () => {
    const deps = dependencies();
    await enqueueWebhook(deps, { ...webhook, topic: "app/scopes_update", payload: { current: ["write_products", "read_products", "read_products"], secret: "x" }, scopes: ["write_products", "read_products", "read_products"] });
    expect(deps.sent[0]?.intake?.scopes).toEqual(["read_products", "write_products"]);
    expect(JSON.stringify(deps.sent[0])).not.toContain("secret");
  });

  it("does not answer success when the queue refuses the message: the error reaches the route, so Shopify retries", async () => {
    const deps = dependencies({ queue: { async send() { throw new Error("queue unavailable"); } } });
    await expect(enqueueWebhook(deps, webhook)).rejects.toThrow("queue unavailable");
  });

  it("logs the latency only after the message is on the queue", async () => {
    const events: string[] = [];
    const deps = dependencies({
      queue: { async send() { events.push("sent"); } },
      log: async (_webhook, latencyMs) => { events.push(`logged:${latencyMs}`); },
    });
    await enqueueWebhook(deps, webhook);
    expect(events).toEqual(["sent", "logged:800"]);
  });
});

describe("parseTriggeredAt", () => {
  it("reads the header, and falls back to receipt time for a missing or unparseable one", () => {
    expect(parseTriggeredAt("2026-10-16T10:00:00.000Z", 5)).toBe(Date.parse("2026-10-16T10:00:00.000Z"));
    expect(parseTriggeredAt(null, 5)).toBe(5);
    expect(parseTriggeredAt("not a date", 5)).toBe(5);
  });
});

describe("sha256Json", () => {
  it("is a stable 64-character hex digest", async () => {
    const digest = await sha256Json({ a: 1 });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Json({ a: 1 })).toBe(digest);
  });
});
