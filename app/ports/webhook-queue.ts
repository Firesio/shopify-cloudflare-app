import { z } from "zod";

/**
 * What the receiver learned from an authenticated delivery, carried by the queue message so the consumer can write the
 * inbox row itself. The raw payload never travels: only the validated, typed values a handler needs (`scopes` for
 * `app/scopes_update`, empty for every other topic) plus an integrity hash.
 */
export interface WebhookIntake {
  readonly topic: string;
  readonly eventId: string;
  readonly apiVersion: string;
  /** Epoch ms of `X-Shopify-Triggered-At` — what ordering decisions compare. */
  readonly triggeredAt: number;
  readonly receivedAt: number;
  readonly payloadHash: string;
  readonly scopes: readonly string[];
}

export interface QueuedWebhook {
  readonly shop: string;
  /** `X-Shopify-Webhook-Id`: the inbox primary key, so it is also the idempotency key of the whole pipeline. */
  readonly id: string;
  readonly attempts?: number;
  /**
   * Absent on a message enqueued before the receiver went queue-first: its inbox row already exists, so the consumer
   * skips admission. Remove that tolerance once no such message can still be in flight (retry window: hours).
   */
  readonly intake?: WebhookIntake;
}

const intakeSchema = z.object({
  topic: z.string().min(1),
  eventId: z.string().min(1),
  apiVersion: z.string().min(1),
  triggeredAt: z.number().int(),
  receivedAt: z.number().int(),
  payloadHash: z.string().min(1),
  scopes: z.array(z.string()),
});

const queuedWebhookSchema = z.object({ shop: z.string().min(1), id: z.string().min(1), intake: intakeSchema.optional() });

export function isQueuedWebhook(value: unknown): value is QueuedWebhook {
  return queuedWebhookSchema.safeParse(value).success;
}
