import type { VerifiedWebhook } from "~/adapters/shopify-webhook.server";
import { getEnv } from "~/request-context.server";
import { enqueueWebhook, parseTriggeredAt, sha256Json } from "~/services/webhook-ingest";
import { formatWebhookLog, writeWebhookLog } from "~/services/webhook-logging";

/**
 * Hand a signature-verified delivery to the queue, which is all a webhook route may do before it answers 2xx. Every
 * topic's route ends here, so the receive path is the same for all of them and the only per-topic part is what the
 * route reads from the payload (`scopes`).
 */
export async function enqueueVerifiedWebhook(authenticated: VerifiedWebhook, scopes?: readonly string[]): Promise<void> {
  const now = Date.now();
  await enqueueWebhook({
    queue: { send: async (message) => { await getEnv().WEBHOOK_QUEUE.send(message); } },
    now: Date.now,
    hashPayload: sha256Json,
    log: async (webhook, latencyMs) => writeWebhookLog(await formatWebhookLog({
      deliveryId: webhook.webhookId, topic: webhook.topic, shop: webhook.shop, handler: webhook.topic, outcome: "queued", attempts: 0, latencyMs,
    })),
  }, {
    webhookId: authenticated.webhookId,
    eventId: authenticated.eventId ?? authenticated.webhookId,
    topic: authenticated.topic,
    shop: authenticated.shop,
    apiVersion: authenticated.apiVersion,
    triggeredAt: parseTriggeredAt(authenticated.triggeredAt, now),
    receivedAt: now,
    payload: authenticated.payload,
    ...(scopes === undefined ? {} : { scopes }),
  });
}
