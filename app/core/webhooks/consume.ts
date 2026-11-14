import { parseQueuedWebhook, processWebhook, type ProcessDeps } from "@firesio/shopify";

/** The part of a Queue batch the consumer uses (a real `MessageBatch` fits). */
export interface WebhookBatch {
  readonly messages: readonly { readonly body: unknown; ack(): void; retry(options?: { readonly delaySeconds?: number }): void }[];
}

export interface ConsumeDeps {
  readonly process: ProcessDeps;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

const RETRY_DELAY_SECONDS = 30;

/**
 * Settle every message of a batch: a webhook that cannot succeed (an unknown topic, a payload that does not fit) is
 * acknowledged and kept as a `failed` inbox row; one whose handler or inbox failed is retried until the queue's DLQ takes it.
 * One bad message never costs the others their turn.
 */
export async function consumeWebhooks(deps: ConsumeDeps, batch: WebhookBatch): Promise<void> {
  for (const message of batch.messages) {
    const work = parseQueuedWebhook(message.body);
    if (!work.ok) {
      deps.log({ event: "webhook.invalid_message" });
      message.ack();
      continue;
    }
    const result = await processWebhook(deps.process, work.value);
    if (result.ok) {
      deps.log({ event: "webhook.settled", topic: work.value.intake.topic, outcome: result.value });
      message.ack();
    } else {
      deps.log({ event: "webhook.retry", topic: work.value.intake.topic, reason: result.error.reason });
      message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
    }
  }
}
