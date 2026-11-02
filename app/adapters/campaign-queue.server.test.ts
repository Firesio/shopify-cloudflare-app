import { describe, expect, it } from "vitest";
import { CloudflareCampaignQueue } from "./campaign-queue.server";

function recorder() {
  const sent: { body: unknown; options: { contentType: "json"; delaySeconds?: number } }[] = [];
  return { sent, queue: new CloudflareCampaignQueue({ send: async (body, options) => void sent.push({ body, options }) }) };
}

describe("CloudflareCampaignQueue", () => {
  it("sends only the campaign id, as JSON", async () => {
    const { sent, queue } = recorder();
    await queue.enqueue("campaign-1", 0);
    expect(sent).toEqual([{ body: { campaignId: "campaign-1" }, options: { contentType: "json" } }]);
  });

  it("passes the throttle as the message's delay", async () => {
    const { sent, queue } = recorder();
    await queue.enqueue("campaign-1", 2);
    expect(sent[0]?.options).toEqual({ contentType: "json", delaySeconds: 2 });
  });

  it("lets a refusal reach the caller, which decides how to degrade", async () => {
    const queue = new CloudflareCampaignQueue({ send: async () => { throw new Error("queue down"); } });
    await expect(queue.enqueue("campaign-1", 0)).rejects.toThrow("queue down");
  });
});
