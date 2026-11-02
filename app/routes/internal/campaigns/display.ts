import type { CampaignStatus } from "~/domain/campaign";
import type { PauseReason, RecipientCounts } from "~/domain/campaign-delivery";
import type { RecipientStatus } from "~/ports/campaigns";
import { paths } from "~/urls";

/** The editor for a campaign that does not exist yet. */
export const NEW_CAMPAIGN_PATH = `${paths.internal.campaigns()}/new`;

/** The internal console is staff-only and English-only: the words here are not translated. */

export const STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = {
  draft: "Draft",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
};

export const STATUS_VARIANT: Readonly<Record<CampaignStatus, "default" | "secondary" | "outline" | "destructive">> = {
  draft: "outline",
  sending: "default",
  paused: "destructive",
  sent: "secondary",
  cancelled: "outline",
};

/** One line under the status, in the words a person would use. */
export const STATUS_HINT: Readonly<Record<CampaignStatus, string>> = {
  draft: "Not sent yet. Nothing goes out until you press Send.",
  sending: "Going out to merchants now, a few at a time.",
  paused: "Stopped. Nobody else will be written to until it is resumed.",
  sent: "Everyone has been handled. This cannot be changed.",
  cancelled: "Stopped for good. Whoever already got it keeps it.",
};

/** Why the system paused a campaign, and what a person should do about it. */
export const PAUSE_EXPLANATION: Readonly<Record<PauseReason, { readonly title: string; readonly advice: string }>> = {
  high_failure_rate: {
    title: "Paused automatically: most mails are being rejected",
    advice:
      "Half or more of the latest mails were rejected for good. Sending on would damage the sender's reputation for support replies too. Look at the Failed recipients below, fix the cause, then Resume.",
  },
  channel_unavailable: {
    title: "Paused automatically: email sending is not set up",
    advice: "The mail channel is not available on this deployment, so nothing can be sent. Ask whoever runs the deployment to set up email sending, then Resume.",
  },
};

export const RECIPIENT_STATUSES = ["pending", "sent", "failed", "refused", "skipped"] as const satisfies readonly RecipientStatus[];

export const RECIPIENT_LABEL: Readonly<Record<RecipientStatus, string>> = {
  pending: "Waiting",
  sent: "Sent",
  failed: "Failed",
  refused: "Refused",
  skipped: "Skipped",
};

/** What each count means, for the person reading the report. */
export const RECIPIENT_MEANING: Readonly<Record<RecipientStatus, string>> = {
  pending: "Not written to yet",
  sent: "Handed to the mail provider",
  failed: "The provider rejected the address",
  refused: "Not tried: no usable address",
  skipped: "Unsubscribed, or left unsent when cancelled",
};

/** The recipient filter from the URL; anything else means "everyone". */
export function toRecipientStatus(value: string | null): RecipientStatus | null {
  return RECIPIENT_STATUSES.find((status) => status === value) ?? null;
}

export function countOf(counts: RecipientCounts, status: RecipientStatus): number {
  return counts[status];
}

export function totalOf(counts: RecipientCounts): number {
  return RECIPIENT_STATUSES.reduce((total, status) => total + counts[status], 0);
}
