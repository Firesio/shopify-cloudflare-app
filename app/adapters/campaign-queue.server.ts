import type { CampaignPumpQueue } from "~/ports/campaigns";

/** Cloudflare Queues producer for delivery steps. Holds no decisions: the delay is the throttle `pump-campaign` chose. */
export class CloudflareCampaignQueue implements CampaignPumpQueue {
  constructor(private readonly queue: { send(body: unknown, options: { contentType: "json"; delaySeconds?: number }): Promise<unknown> }) {}

  async enqueue(campaignId: string, delaySeconds: number): Promise<void> {
    await this.queue.send({ campaignId }, { contentType: "json", ...(delaySeconds > 0 ? { delaySeconds } : {}) });
  }
}
