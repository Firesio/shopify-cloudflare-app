import { describe, expect, it } from "vitest";
import type { WebhookDeliveryInput } from "~/ports/webhook-deliveries";
import type { QueuedWebhook, WebhookIntake } from "~/ports/webhook-queue";
import { admitWebhook, type WebhookAdmissionDependencies } from "./webhook-admission";

const intake: WebhookIntake = { topic: "app/scopes_update", eventId: "event-1", apiVersion: "2026-10", triggeredAt: 100, receivedAt: 200, payloadHash: "b".repeat(64), scopes: ["read_products"] };
const work: QueuedWebhook = { shop: "example.myshopify.com", id: "delivery-1", intake };

function dependencies(overrides: { claim?: "claimed" | "duplicate"; suppressed?: boolean; recordFails?: boolean } = {}) {
  const claims: WebhookDeliveryInput[] = [];
  const recorded: { id: string; shop: string; scopes: readonly string[] }[] = [];
  const deps: WebhookAdmissionDependencies = {
    deliveries: { async claim(input) { claims.push(input); return overrides.claim ?? "claimed"; } },
    scopes: {
      async record(id, shop, scopes) {
        if (overrides.recordFails) throw new Error("d1 down");
        recorded.push({ id, shop, scopes });
      },
    },
    redaction: { isSuppressed: async (_shop, source) => overrides.suppressed === true && source === "webhook_delivery" },
  };
  return { deps, claims, recorded };
}

describe("admitWebhook", () => {
  it("writes the inbox row from the message and records the typed scope values", async () => {
    const { deps, claims, recorded } = dependencies();
    await expect(admitWebhook(deps, work)).resolves.toBe("admitted");
    expect(claims).toEqual([{ id: "delivery-1", eventId: "event-1", topic: "app/scopes_update", apiVersion: "2026-10", shop: "example.myshopify.com", triggeredAt: 100, receivedAt: 200, payloadHash: "b".repeat(64) }]);
    expect(recorded).toEqual([{ id: "delivery-1", shop: "example.myshopify.com", scopes: ["read_products"] }]);
  });

  it("is admitted, not rejected, when the same webhook id arrives again, and still re-records the scopes", async () => {
    // A pass that died between the claim and the record leaves a row with no values; the redelivery must finish it.
    const { deps, recorded } = dependencies({ claim: "duplicate" });
    await expect(admitWebhook(deps, work)).resolves.toBe("admitted");
    expect(recorded).toHaveLength(1);
  });

  it("drops a delivery for a redacted shop before any write", async () => {
    const { deps, claims, recorded } = dependencies({ suppressed: true });
    await expect(admitWebhook(deps, work)).resolves.toBe("suppressed");
    expect(claims).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("leaves a message from before the queue-first receiver alone: its row already exists", async () => {
    const { deps, claims } = dependencies();
    await expect(admitWebhook(deps, { shop: work.shop, id: work.id })).resolves.toBe("admitted");
    expect(claims).toEqual([]);
  });

  it("lets a failure reach the queue so the message is retried, rather than acknowledging a delivery with no row", async () => {
    const { deps } = dependencies({ recordFails: true });
    await expect(admitWebhook(deps, work)).rejects.toThrow("d1 down");
  });
});
