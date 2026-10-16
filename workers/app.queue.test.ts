import { eq } from "drizzle-orm";
import { makeDb } from "~/db/client";
import * as schema from "~/db/schema";
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { handleWebhookQueueBatch } from "../app/services/webhook-queue";
import { consumeWebhook } from "../app/services/webhook-consumer";
import { WebhookDeliveryRepo } from "../app/models/webhook-deliveries.server";
import { runWithRequestContext } from "../app/request-context.server";
import { setupTestDatabase } from "../app/test/db";
import { WebhookScopeObservationRepo } from "../app/models/webhook-scope-observations.server";
import { admitWebhook } from "../app/services/webhook-admission";
import { noRedaction } from "../app/test/redaction";
import { webhookQueueDependencies } from "../app/wiring/webhooks.server";

setupTestDatabase();

describe("handleWebhookQueueBatch", () => {
  it("acks missing delivery without handler writes", async () => {
    const events: string[] = [];
    await handleWebhookQueueBatch({
      messages: [{
        body: { shop: "redacted.myshopify.com", id: "delivery-1" },
        attempts: 1,
        ack: () => events.push("ack"),
        retry: () => events.push("retry"),
      }],
    }, {
      now: () => 100,
      consume: async () => ({ outcome: "missing", topic: null }),
      log: (entry) => { events.push(entry.outcome); },
    });
    expect(events).toEqual(["discarded", "ack"]);
  });

  it("retries failed final attempt after consumer persists dead letter", async () => {
    const events: string[] = [];
    await handleWebhookQueueBatch({
      messages: [{
        body: { shop: "shop.myshopify.com", id: "delivery-1" },
        attempts: 8,
        ack: () => events.push("ack"),
        retry: () => events.push("retry"),
      }],
    }, {
      now: () => 100,
      consume: async () => {
        events.push("dead-letter-persisted");
        throw new Error("broken");
      },
      log: (entry) => { events.push(entry.outcome); },
    });
    expect(events).toEqual(["dead-letter-persisted", "failed", "retry"]);
  });

  it("skips missing redacted delivery with real D1 consumer", async () => {
    await runWithRequestContext(env, async () => {
      let handlerWrites = 0;
      const events: string[] = [];
      await handleWebhookQueueBatch({ messages: [{
        body: { shop: "redacted.myshopify.com", id: "missing-worker-delivery" }, attempts: 1,
        ack: () => { events.push("ack"); }, retry: () => { events.push("retry"); },
      }] }, {
        now: () => 100,
        consume: (work) => consumeWebhook({
          deliveries: new WebhookDeliveryRepo(), now: () => 100,
          handlers: { "app/uninstalled": async () => { handlerWrites += 1; }, "app/scopes_update": async () => {}, "customers/data_request": async () => {}, "customers/redact": async () => {}, "shop/redact": async () => {} },
        }, work),
        log: () => {},
      });
      expect(handlerWrites).toBe(0);
      expect(events).toEqual(["ack"]);
    });
  });

  it("persists dead letter in real D1 on final attempt and retries queue message", async () => {
    await runWithRequestContext(env, async () => {
      const shop = "worker-dead-letter.myshopify.com";
      const id = "worker-dead-letter-delivery";
      await makeDb(env.DB).insert(schema.webhookDeliveries).values({ id: id, eventId: "event", topic: "app/uninstalled", apiVersion: "2025-01", shop: shop, triggeredAt: 1, receivedAt: 1, payloadHash: "hash", status: "queued" }).run();
      const events: string[] = [];
      await handleWebhookQueueBatch({ messages: [{
        body: { shop, id }, attempts: 9,
        ack: () => { events.push("ack"); }, retry: () => { events.push("retry"); },
      }] }, {
        now: () => 100,
        consume: (work) => consumeWebhook({
          deliveries: new WebhookDeliveryRepo(), now: () => 100,
          handlers: { "app/uninstalled": async () => { throw new Error("broken"); }, "app/scopes_update": async () => {}, "customers/data_request": async () => {}, "customers/redact": async () => {}, "shop/redact": async () => {} },
        }, work),
        log: () => {},
      });
      const row = await makeDb(env.DB).select({ status: schema.webhookDeliveries.status, failure_code: schema.webhookDeliveries.failureCode }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id)).get();
      expect(row).toEqual({ status: "dead_letter", failure_code: "dead_letter" });
      expect(events).toEqual(["retry"]);
    });
  });

  it("persists unsupported topic as dead letter on final attempt and retries queue message", async () => {
    await runWithRequestContext(env, async () => {
      const shop = "worker-unsupported-topic.myshopify.com";
      const id = "worker-unsupported-topic-delivery";
      await makeDb(env.DB).insert(schema.webhookDeliveries).values({ id: id, eventId: "event", topic: "orders/created", apiVersion: "2025-01", shop: shop, triggeredAt: 1, receivedAt: 1, payloadHash: "hash", status: "queued" }).run();
      const events: string[] = [];
      await handleWebhookQueueBatch({ messages: [{
        body: { shop, id }, attempts: 9,
        ack: () => { events.push("ack"); }, retry: () => { events.push("retry"); },
      }] }, {
        now: () => 100,
        consume: (work) => consumeWebhook({
          deliveries: new WebhookDeliveryRepo(), now: () => 100,
          handlers: { "app/uninstalled": async () => {}, "app/scopes_update": async () => {}, "customers/data_request": async () => {}, "customers/redact": async () => {}, "shop/redact": async () => {} },
        }, work),
        log: () => {},
      });
      const row = await makeDb(env.DB).select({ status: schema.webhookDeliveries.status, failure_code: schema.webhookDeliveries.failureCode }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id)).get();
      expect(row).toEqual({ status: "dead_letter", failure_code: "dead_letter" });
      expect(events).toEqual(["ack"]);
    });
  });
});

describe("the webhook queue consumer's attempt count (the wiring workers/app.ts runs)", () => {
  const failingConsumer = () => ({
    deliveries: new WebhookDeliveryRepo(),
    now: () => 100,
    admit: (work: Parameters<typeof admitWebhook>[1]) => admitWebhook({ deliveries: new WebhookDeliveryRepo(), scopes: new WebhookScopeObservationRepo(), redaction: noRedaction }, work),
    handlers: { "app/uninstalled": async () => { throw new Error("broken"); }, "app/scopes_update": async () => {}, "customers/data_request": async () => {}, "customers/redact": async () => {}, "shop/redact": async () => {} },
  });
  const message = (shop: string, id: string, attempts: number, events: string[]) => ({
    body: { shop, id, intake: { topic: "app/uninstalled", eventId: "event", apiVersion: "2026-10", triggeredAt: 1, receivedAt: 2, payloadHash: "hash", scopes: [] } },
    attempts,
    ack: () => { events.push("ack"); },
    retry: () => { events.push("retry"); },
  });
  const statusOf = (id: string) => makeDb(env.DB).select({ status: schema.webhookDeliveries.status }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, id)).get();

  it("admits the message, fails the handler, and keeps retrying through delivery 8: Cloudflare counts the first delivery as attempt 1", async () => {
    await runWithRequestContext(env, async () => {
      const events: string[] = [];
      for (const attempts of [1, 8]) {
        await handleWebhookQueueBatch({ messages: [message("attempts.myshopify.com", "attempts-1", attempts, events)] }, webhookQueueDependencies(failingConsumer));
      }
      // Delivery 8 of 9 is not the last one: the row must still be retryable, not dead-lettered a delivery early.
      expect(await statusOf("attempts-1")).toEqual({ status: "failed" });
      expect(events).toEqual(["retry", "retry"]);
    });
  });

  it("dead-letters the row only on delivery 9, the last one that max_retries 8 allows", async () => {
    await runWithRequestContext(env, async () => {
      const events: string[] = [];
      await handleWebhookQueueBatch({ messages: [message("attempts9.myshopify.com", "attempts-9", 9, events)] }, webhookQueueDependencies(failingConsumer));
      expect(await statusOf("attempts-9")).toEqual({ status: "dead_letter" });
      expect(events).toEqual(["retry"]);
    });
  });
});
