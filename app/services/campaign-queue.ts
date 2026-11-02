import { z } from "zod";
import { retryDelaySeconds } from "~/services/notification-queue";
import type { PumpResult } from "~/services/campaigns/pump-campaign";

/** One delivery step: which campaign to send the next page of. Nothing else travels in the queue. */
const stepSchema = z.object({ campaignId: z.string().min(1) });

export interface CampaignMessageLike {
  readonly body: unknown;
  /** Deliveries so far, including this one (starts at 1). */
  readonly attempts: number;
  readonly ack: () => void;
  readonly retry: (options?: { readonly delaySeconds?: number }) => void;
}

export interface CampaignBatchLike {
  readonly messages: readonly CampaignMessageLike[];
}

export type CampaignQueueLog =
  | { readonly event: "campaign.queue_invalid" }
  | { readonly event: "campaign.queue_step"; readonly campaign: string; readonly attempts: number; readonly result: PumpResult["kind"] }
  | { readonly event: "campaign.queue_retry"; readonly campaign: string; readonly attempts: number; readonly outcome: string; readonly delaySeconds: number };

export interface CampaignConsumerDependencies {
  readonly pump: (campaignId: string) => Promise<PumpResult>;
  readonly log: (entry: CampaignQueueLog) => void;
}

/** Steps run one after another: each schedules the next, and the gap between them is the throttle. */
export async function handleCampaignBatch(batch: CampaignBatchLike, dependencies: CampaignConsumerDependencies): Promise<void> {
  for (const message of batch.messages) {
    await processCampaignMessage(message, dependencies);
  }
}

export async function processCampaignMessage(message: CampaignMessageLike, dependencies: CampaignConsumerDependencies): Promise<void> {
  const parsed = stepSchema.safeParse(message.body);
  if (!parsed.success) {
    // The same bytes can never become valid, so a retry only burns attempts.
    dependencies.log({ event: "campaign.queue_invalid" });
    message.ack();
    return;
  }

  const { campaignId } = parsed.data;
  try {
    const result = await dependencies.pump(campaignId);
    dependencies.log({ event: "campaign.queue_step", campaign: campaignId, attempts: message.attempts, result: result.kind });
    message.ack();
  } catch (cause) {
    // A step that failed part-way is safe to run again: it picks up whoever is still pending, and no mail is repeated.
    const delaySeconds = retryDelaySeconds(message.attempts);
    dependencies.log({
      event: "campaign.queue_retry",
      campaign: campaignId,
      attempts: message.attempts,
      outcome: cause instanceof Error ? cause.name : "unknown",
      delaySeconds,
    });
    message.retry({ delaySeconds });
  }
}
