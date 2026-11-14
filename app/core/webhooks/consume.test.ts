import { env } from "cloudflare:test";
import { createWebhookRouter, type QueuedWebhook } from "@firesio/shopify";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { outboxEvents } from "~/test/outbox";
import { consumeDeps } from "~/wiring/scheduled";
import { createServices } from "~/wiring/services";
import { consumeWebhooks, type WebhookBatch } from "./consume";
import { recordInstall } from "../shops/lifecycle";

setupTestDatabase();

const SHOP = "consume-one.myshopify.com";
const OTHER = "consume-two.myshopify.com";
const T0 = 1_700_000_000_000;

function queued(topic: string, shop: string, id: string, triggeredAt = T0 + 1_000): QueuedWebhook {
  return { shop, id, intake: { topic, eventId: `event-${id}`, apiVersion: "2026-10", triggeredAt, receivedAt: T0, payloadHash: "hash" } };
}

/** A batch that records what became of each message. */
function batchOf(...bodies: unknown[]): { batch: WebhookBatch; settled: string[] } {
  const settled: string[] = [];
  const batch = { messages: bodies.map((body, index) => ({ body, ack: () => void settled.push(`ack:${index}`), retry: () => void settled.push(`retry:${index}`) })) };
  return { batch, settled };
}

const deps = () => consumeDeps(createServices(env));

describe("consuming the webhook queue", () => {
  it("runs the uninstall for the shop in the message and emits shop.uninstalled", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    const { batch, settled } = batchOf(queued("app/uninstalled", SHOP, "w1"));
    await consumeWebhooks(deps(), batch);
    expect(settled).toEqual(["ack:0"]);
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("UNINSTALLED");
    expect((await outboxEvents()).map((event) => event.type)).toEqual(["shop.installed", "shop.uninstalled"]);
  });

  it("does the work once when the same delivery arrives twice", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    const message = queued("app/uninstalled", SHOP, "w2");
    await consumeWebhooks(deps(), batchOf(message, message).batch);
    expect((await outboxEvents()).filter((event) => event.type === "shop.uninstalled")).toHaveLength(1);
    const row = await env.DB.prepare(`SELECT status, attempts FROM webhook_deliveries WHERE id = 'w2'`).first();
    expect(row?.["status"]).toBe("processed");
  });

  it("acknowledges and keeps as failed a topic nobody handles, and drops a message that is not a webhook", async () => {
    const { batch, settled } = batchOf(queued("orders/create", SHOP, "w3"), { nonsense: true });
    await consumeWebhooks(deps(), batch);
    expect(settled).toEqual(["ack:0", "ack:1"]);
    const row = await env.DB.prepare(`SELECT status, failure_code FROM webhook_deliveries WHERE id = 'w3'`).first();
    expect(row).toMatchObject({ status: "failed", failure_code: "unsupported_topic" });
  });

  it("retries a delivery whose handler failed, and a later delivery of it can succeed", async () => {
    const failing = { ...deps(), process: { ...deps().process, router: createWebhookRouter({ "app/uninstalled": async () => { throw new Error("boom"); } }) } };
    const { batch, settled } = batchOf(queued("app/uninstalled", SHOP, "w4"));
    await consumeWebhooks(failing, batch);
    expect(settled).toEqual(["retry:0"]);
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    await consumeWebhooks(deps(), batchOf(queued("app/uninstalled", SHOP, "w4")).batch);
    expect((await createServices(env).shops.get(SHOP))?.relationshipStatus).toBe("UNINSTALLED");
  });

  it("scopes an uninstall to the shop that sent it", async () => {
    await recordInstall(createServices(env).lifecycle, SHOP, T0);
    await recordInstall(createServices(env).lifecycle, OTHER, T0);
    await consumeWebhooks(deps(), batchOf(queued("app/uninstalled", SHOP, "w5")).batch);
    expect((await createServices(env).shops.get(OTHER))?.relationshipStatus).toBe("INSTALLED");
  });
});
