import type { WebhookDeliveryInput } from "~/ports/webhook-deliveries";
import type { QueuedWebhook } from "~/ports/webhook-queue";
import type { RedactionGuard } from "~/services/redaction-guard";

export interface WebhookAdmissionDependencies {
  readonly deliveries: { claim(input: WebhookDeliveryInput): Promise<"claimed" | "duplicate"> };
  readonly scopes: { record(deliveryId: string, shop: string, scopes: readonly string[]): Promise<void> };
  /** A redacted shop's deliveries are acknowledged and dropped: no delivery row may carry its domain again. */
  readonly redaction: Pick<RedactionGuard, "isSuppressed">;
}

export type WebhookAdmission = "admitted" | "suppressed";

/**
 * The consumer's first step for a message that carries an `intake`: write the inbox row. Everything the request used
 * to do before answering lives here instead, where a failure is retried by the queue rather than costing Shopify's
 * 5 s window.
 *
 * Idempotent by construction: the Shopify webhook id is the row's primary key, so a message delivered twice (a
 * Shopify retry that produced a second message, or the queue's own at-least-once redelivery) claims once and the
 * second pass finds the existing row. The typed scope values are recorded on EVERY pass, not only the first, because
 * they are `ON CONFLICT DO NOTHING`: a pass that died between the claim and the record must not leave a row with no
 * values, which `app/scopes_update` would read as "every scope revoked".
 *
 * A message with no `intake` predates the queue-first receiver; its row already exists.
 */
export async function admitWebhook(dependencies: WebhookAdmissionDependencies, work: QueuedWebhook): Promise<WebhookAdmission> {
  const { intake } = work;
  if (intake === undefined) return "admitted";
  if (await dependencies.redaction.isSuppressed(work.shop, "webhook_delivery")) return "suppressed";

  await dependencies.deliveries.claim({
    id: work.id,
    eventId: intake.eventId,
    topic: intake.topic,
    apiVersion: intake.apiVersion,
    shop: work.shop,
    triggeredAt: intake.triggeredAt,
    receivedAt: intake.receivedAt,
    payloadHash: intake.payloadHash,
  });
  await dependencies.scopes.record(work.id, work.shop, intake.scopes);
  return "admitted";
}
