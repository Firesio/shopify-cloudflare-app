import { webhookDeliveries } from "~/wiring.server";

/**
 * Put a delivery in the inbox the way the consumer's admission step leaves it (a claimed row), so a consumer test can
 * start from "this delivery has been admitted". Call inside `runWithRequestContext`.
 */
export async function admittedDelivery(input: { shop: string; id: string; topic: string; triggeredAt: number }): Promise<{ shop: string; id: string }> {
  await webhookDeliveries().claim({
    id: input.id, eventId: `event-${input.id}`, topic: input.topic, apiVersion: "2026-07", shop: input.shop,
    triggeredAt: input.triggeredAt, receivedAt: input.triggeredAt + 1, payloadHash: "a".repeat(64),
  });
  return { shop: input.shop, id: input.id };
}
