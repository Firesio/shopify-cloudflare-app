import { describe, expect, it } from "vitest";
import type { NotifyResult } from "~/notifications/notify.server";
import { RetryableNotificationError } from "~/notifications/dispatch.server";
import type { NotifyRequest } from "~/ports/notifier";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { createCampaignMailer, mailOutcomeOf } from "./campaign-mailer.server";

const allowed: NotifyResult["decisions"] = [{ channel: "email", allowed: true }];
const result = (overrides: Partial<NotifyResult>): NotifyResult => ({ event: "campaign_message", dispatched: [], decisions: allowed, ...overrides });

describe("mailOutcomeOf", () => {
  it("is sent when the email went out", () => {
    expect(mailOutcomeOf(result({ dispatched: [{ outcome: { status: "sent" }, skipped: false }] }))).toEqual({ kind: "sent" });
  });

  it("is sent when an earlier attempt already sent it", () => {
    expect(mailOutcomeOf(result({ dispatched: [{ outcome: { status: "sent" }, skipped: true }] }))).toEqual({ kind: "sent" });
  });

  it("is rejected, with the reason, for a permanent failure", () => {
    const failed = { status: "failed", reason: "rejected", retriable: false } as const;
    expect(mailOutcomeOf(result({ dispatched: [{ outcome: failed, skipped: false }] }))).toEqual({ kind: "rejected", reason: "rejected" });
  });

  it("is refused when the dispatch itself refused", () => {
    const refused = { status: "refused", reason: "recipient_unreachable" } as const;
    expect(mailOutcomeOf(result({ dispatched: [{ outcome: refused, skipped: false }] }))).toEqual({ kind: "refused", reason: "recipient_unreachable" });
  });

  it("is unavailable, not a refusal about the recipient, when the channel is not set up", () => {
    const decisions: NotifyResult["decisions"] = [{ channel: "email", allowed: false, reason: "channel_unavailable" }];
    expect(mailOutcomeOf(result({ decisions }))).toEqual({ kind: "unavailable" });
  });

  it.each(["recipient_opted_out", "recipient_unreachable", "not_selected"] as const)("is a refusal about the recipient for %s", (reason) => {
    const decisions: NotifyResult["decisions"] = [{ channel: "email", allowed: false, reason }];
    expect(mailOutcomeOf(result({ decisions }))).toEqual({ kind: "refused", reason });
  });

  it("is refused as unreachable when nothing was dispatched and nothing says why", () => {
    expect(mailOutcomeOf(result({ decisions: [] }))).toEqual({ kind: "refused", reason: "recipient_unreachable" });
  });
});

describe("createCampaignMailer", () => {
  const input = { campaignId: "c1", shop: "alpha.myshopify.com", email: "owner@firesio.app", payload: SAMPLE_PAYLOADS.campaign_message };

  it("asks notify for the campaign event, scoped to the shop, with one dedupe key per campaign and shop", async () => {
    const seen: NotifyRequest<"campaign_message">[] = [];
    const mailer = createCampaignMailer({
      notify: async (request) => {
        seen.push(request);
        return result({ dispatched: [{ outcome: { status: "sent" }, skipped: false }] });
      },
    });
    expect(await mailer.send(input)).toEqual({ kind: "sent" });
    expect(seen).toEqual([
      { event: "campaign_message", to: { email: "owner@firesio.app" }, payload: input.payload, scope: "alpha.myshopify.com", dedupeKey: "campaign:c1:alpha.myshopify.com" },
    ]);
  });

  it("reports a retriable failure as transient, so the step backs off instead of failing", async () => {
    const mailer = createCampaignMailer({
      notify: async () => {
        throw new RetryableNotificationError("throttled", "log-1");
      },
    });
    expect(await mailer.send(input)).toEqual({ kind: "transient" });
  });

  it("lets any other error through, so the queue retries the step and the bug is seen", async () => {
    const mailer = createCampaignMailer({
      notify: async () => {
        throw new TypeError("a bug");
      },
    });
    await expect(mailer.send(input)).rejects.toThrow("a bug");
  });
});
