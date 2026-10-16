import type { QueuedWebhook } from "~/ports/webhook-queue";

/**
 * The receiver's whole job, after the signature is checked: put ONE durable message on the queue and answer 2xx.
 *
 * Shopify allows 5 s for the response and retries a non-2xx up to 8 times over 4 hours, so the request must not
 * depend on anything slow, and the 2xx must mean "this delivery will not be lost". A queue send is the one durable
 * write that satisfies both: if it succeeds the message is redelivered until a consumer acknowledges it; if it throws
 * the request answers 5xx and Shopify retries. There is deliberately no inbox write in the request: a row marked
 * "queued" before the send could outlive a worker that died in between, and the retry would then be taken for a
 * duplicate. Admission (dedupe, tombstone, inbox row) happens in the consumer, `admitWebhook`.
 */
export interface WebhookEnqueueDependencies {
  readonly queue: { send(message: QueuedWebhook): Promise<void> };
  /** Epoch milliseconds; the log reports latency as `now() - receivedAt`. */
  readonly now: () => number;
  readonly hashPayload: (payload: unknown) => Promise<string>;
  readonly log?: (webhook: AuthenticatedWebhook, latencyMs: number) => Promise<void>;
}

export interface AuthenticatedWebhook {
  readonly webhookId: string;
  readonly eventId: string;
  readonly topic: string;
  readonly shop: string;
  readonly apiVersion: string;
  readonly triggeredAt: number;
  readonly receivedAt: number;
  readonly payload: unknown;
  /** Typed values the handler needs from the payload (`app/scopes_update`); the payload itself is never forwarded. */
  readonly scopes?: readonly string[];
}

export async function enqueueWebhook(dependencies: WebhookEnqueueDependencies, webhook: AuthenticatedWebhook): Promise<void> {
  await dependencies.queue.send({
    shop: webhook.shop,
    id: webhook.webhookId,
    intake: {
      topic: normalizeWebhookTopic(webhook.topic),
      eventId: webhook.eventId,
      apiVersion: webhook.apiVersion,
      triggeredAt: webhook.triggeredAt,
      receivedAt: webhook.receivedAt,
      payloadHash: await dependencies.hashPayload(webhook.payload),
      scopes: [...new Set(webhook.scopes ?? [])].sort(),
    },
  });
  await dependencies.log?.(webhook, dependencies.now() - webhook.receivedAt);
}

/** Shopify authentication returns enum names; consumers use webhook paths. */
function normalizeWebhookTopic(topic: string): string {
  if (topic.includes("/")) return topic.toLowerCase();
  const separator = topic.indexOf("_");
  return separator < 0
    ? topic.toLowerCase()
    : `${topic.slice(0, separator).toLowerCase()}/${topic.slice(separator + 1).toLowerCase()}`;
}

/**
 * Epoch ms of `X-Shopify-Triggered-At`, which ordering decisions compare against. A missing or unparseable header
 * falls back to receipt time rather than storing NaN, which would compare as neither older nor newer than anything.
 */
export function parseTriggeredAt(header: string | null, receivedAt: number): number {
  const parsed = header === null ? Number.NaN : Date.parse(header);
  return Number.isFinite(parsed) ? parsed : receivedAt;
}

export async function sha256Json(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
