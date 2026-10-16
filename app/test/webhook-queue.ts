import { env } from "cloudflare:test";
import { vi } from "vitest";
import { isQueuedWebhook, type QueuedWebhook } from "~/ports/webhook-queue";

const SENT = { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } };

/**
 * Collect what a webhook route puts on `WEBHOOK_QUEUE` instead of sending it, so a test can hand the message to the
 * consumer the way the Queue would. Every message is validated against the real wire schema on the way in, so a
 * route that sends a malformed message fails the test that exercised it. Restore with `vi.restoreAllMocks()`.
 */
export function captureWebhookQueue(): QueuedWebhook[] {
  const sent: QueuedWebhook[] = [];
  vi.spyOn(env.WEBHOOK_QUEUE, "send").mockImplementation(async (message) => {
    if (!isQueuedWebhook(message)) throw new Error("A webhook route enqueued a message that is not a QueuedWebhook.");
    sent.push(message);
    return SENT;
  });
  return sent;
}

/** A queue that refuses every message, for the route's "send failed, so Shopify must retry" path. */
export function failWebhookQueue(): void {
  vi.spyOn(env.WEBHOOK_QUEUE, "send").mockRejectedValue(new Error("queue unavailable"));
}
