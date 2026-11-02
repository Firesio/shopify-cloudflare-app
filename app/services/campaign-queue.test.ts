import { describe, expect, it } from "vitest";
import { handleCampaignBatch, type CampaignConsumerDependencies, type CampaignMessageLike, type CampaignQueueLog } from "./campaign-queue";
import type { PumpResult } from "./campaigns/pump-campaign";

function message(body: unknown, attempts = 1) {
  const events: string[] = [];
  const retries: (number | undefined)[] = [];
  const value: CampaignMessageLike = {
    body,
    attempts,
    ack: () => events.push("ack"),
    retry: (options) => {
      events.push("retry");
      retries.push(options?.delaySeconds);
    },
  };
  return { value, events, retries };
}

function harness(pump: CampaignConsumerDependencies["pump"]) {
  const logs: CampaignQueueLog[] = [];
  const asked: string[] = [];
  const dependencies: CampaignConsumerDependencies = {
    pump: async (id) => {
      asked.push(id);
      return pump(id);
    },
    log: (entry) => logs.push(entry),
  };
  return { dependencies, logs, asked };
}

const continued: PumpResult = { kind: "continued", delaySeconds: 2 };

describe("campaign consumer", () => {
  it("runs one delivery step for the named campaign and acknowledges it", async () => {
    const { dependencies, logs, asked } = harness(async () => continued);
    const step = message({ campaignId: "campaign-1" });
    await handleCampaignBatch({ messages: [step.value] }, dependencies);
    expect(asked).toEqual(["campaign-1"]);
    expect(step.events).toEqual(["ack"]);
    expect(logs).toEqual([{ event: "campaign.queue_step", campaign: "campaign-1", attempts: 1, result: "continued" }]);
  });

  it("acknowledges a step whose campaign is gone or no longer sending: the chain simply ends", async () => {
    for (const result of [{ kind: "gone" }, { kind: "idle", status: "paused" }, { kind: "finished" }] satisfies PumpResult[]) {
      const { dependencies } = harness(async () => result);
      const step = message({ campaignId: "c" });
      await handleCampaignBatch({ messages: [step.value] }, dependencies);
      expect(step.events).toEqual(["ack"]);
    }
  });

  it("acknowledges and logs a message that is not a step, without running anything", async () => {
    const { dependencies, logs, asked } = harness(async () => continued);
    for (const body of [null, "x", {}, { campaignId: "" }, { campaignId: 7 }]) {
      const step = message(body);
      await handleCampaignBatch({ messages: [step.value] }, dependencies);
      expect(step.events).toEqual(["ack"]);
    }
    expect(asked).toEqual([]);
    expect(logs.every((entry) => entry.event === "campaign.queue_invalid")).toBe(true);
  });

  it("retries a step that failed, waiting longer each time, and never acknowledges it", async () => {
    const { dependencies, logs } = harness(async () => {
      throw new Error("d1 down");
    });
    const first = message({ campaignId: "c" }, 1);
    const third = message({ campaignId: "c" }, 3);
    await handleCampaignBatch({ messages: [first.value, third.value] }, dependencies);
    expect(first.events).toEqual(["retry"]);
    expect(first.retries).toEqual([30]);
    expect(third.retries).toEqual([120]);
    expect(logs).toContainEqual({ event: "campaign.queue_retry", campaign: "c", attempts: 1, outcome: "Error", delaySeconds: 30 });
  });

  it("handles each message of a batch on its own: one failure does not hold up the next", async () => {
    const { dependencies, asked } = harness(async (id) => {
      if (id === "bad") throw new Error("boom");
      return continued;
    });
    const bad = message({ campaignId: "bad" });
    const good = message({ campaignId: "good" });
    await handleCampaignBatch({ messages: [bad.value, good.value] }, dependencies);
    expect(asked).toEqual(["bad", "good"]);
    expect([bad.events, good.events]).toEqual([["retry"], ["ack"]]);
  });
});
