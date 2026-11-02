import type { MailOutcome } from "~/domain/campaign-delivery";
import { RetryableNotificationError } from "~/notifications/dispatch.server";
import type { NotifyResult } from "~/notifications/notify.server";
import type { NotifyRequest } from "~/ports/notifier";
import type { CampaignMailer } from "~/ports/campaigns";

/**
 * What `notify()` said, in the delivery step's words. PURE.
 *
 * An email that went out, or that an earlier attempt already sent (`skipped`: the dedupe key found its row), is `sent`.
 * Nothing dispatched means eligibility refused it, and the reason decides: a channel that is not set up affects every
 * recipient and stops the campaign, while a reason about this one recipient only leaves them out.
 */
export function mailOutcomeOf(result: NotifyResult): MailOutcome {
  const attempt = result.dispatched[0];
  if (attempt !== undefined) {
    if (attempt.skipped) return { kind: "sent" };
    const { outcome } = attempt;
    if (outcome.status === "sent") return { kind: "sent" };
    // A retriable failure never gets here: `dispatch` throws it so the queue can back off.
    if (outcome.status === "failed") return { kind: "rejected", reason: outcome.reason };
    return { kind: "refused", reason: outcome.reason };
  }
  const refusal = result.decisions.find((decision) => decision.channel === "email" && !decision.allowed);
  if (refusal === undefined || refusal.allowed) return { kind: "refused", reason: "recipient_unreachable" };
  return refusal.reason === "channel_unavailable" ? { kind: "unavailable" } : { kind: "refused", reason: refusal.reason };
}

/**
 * The mailer the delivery step uses: one announcement through the one `notify()` entry point, so it is eligibility-
 * checked, logged and deduplicated like every other mail. The dedupe key is per campaign and shop, so a step that runs
 * twice never sends twice.
 */
export function createCampaignMailer(deps: {
  readonly notify: (request: NotifyRequest<"campaign_message">) => Promise<NotifyResult>;
}): CampaignMailer {
  return {
    async send({ campaignId, shop, email, payload }) {
      try {
        const result = await deps.notify({
          event: "campaign_message",
          to: { email },
          payload,
          scope: shop,
          dedupeKey: `campaign:${campaignId}:${shop}`,
        });
        return mailOutcomeOf(result);
      } catch (cause) {
        // A transient provider error (throttled, a 5xx, the network) is worth another try; anything else is a bug
        // and surfaces, so the queue retries the step and the failure is logged where it can be found.
        if (cause instanceof RetryableNotificationError) return { kind: "transient" };
        throw cause;
      }
    },
  };
}
