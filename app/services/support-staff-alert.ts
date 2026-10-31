import type { Notifier } from "~/ports/notifier";
import type { StaffNotificationRecipients } from "~/ports/staff-notifications";
import { staffTopicForSupportActivity } from "~/notifications/staff-topic";
import { excerpt } from "~/support/excerpt";

export interface StaffAlertDependencies {
  /** Who hears about it, decided by each person's own notification settings. */
  readonly staff: StaffNotificationRecipients;
  readonly notifier: Notifier;
  readonly appUrl: string;
  /** Where a degraded path reports itself: a stable event name, never a body or an address. */
  readonly log: (entry: { readonly event: "support.notify_staff_failed"; readonly reason: string }) => void;
}

export interface StaffAlert {
  readonly ticketId: string;
  readonly shopName: string;
  readonly subject: string;
  readonly body: string;
  readonly isNew: boolean;
  readonly messageId: string;
}

/**
 * Tell the staff who asked to hear about customer activity, on the channel each
 * chose: one email request per person who wants email, one push request per
 * enabled device of each person who wants push.
 *
 * One request each rather than a message with many recipients, so one bad
 * address or dead device cannot suppress the rest. The dedupe key is shared by
 * the whole fan-out for ONE event and made unique per recipient by the log's
 * (key, recipient) pair, so a redelivery sends nothing twice.
 *
 * Best effort and last: the message is already committed, so a failure is logged
 * and never reaches whoever caused it.
 */
export async function alertStaff(dependencies: StaffAlertDependencies, input: StaffAlert): Promise<void> {
  try {
    const recipients = await dependencies.staff.recipientsFor(staffTopicForSupportActivity(input.isNew));
    if (recipients.emails.length === 0 && recipients.devices.length === 0) return;

    const base = {
      event: "support_merchant_activity" as const,
      dedupeKey: input.isNew ? `ticket-opened:${input.ticketId}` : `ticket-reply:${input.ticketId}:${input.messageId}`,
    };
    const content = {
      shopName: input.shopName,
      subject: input.subject,
      excerpt: excerpt(input.body),
      threadUrl: `${dependencies.appUrl.replace(/\/+$/, "")}/internal/support/${input.ticketId}`,
      isNew: input.isNew,
    };

    // Enqueueing is cheap and independent per recipient, so all go at once. The
    // notifier never rejects, so one bad enqueue cannot suppress the others.
    await Promise.all([
      ...recipients.emails.map((recipient) => dependencies.notifier.send({
        ...base,
        to: { email: recipient.email },
        payload: { recipientName: recipient.name, ...content },
      })),
      ...recipients.devices.map((device) => dependencies.notifier.send({
        ...base,
        to: { push: device.subscriptionId },
        // A push is read by a device, not addressed to a person by name.
        payload: { recipientName: "Staff", ...content },
      })),
    ]);
  } catch (cause) {
    dependencies.log({ event: "support.notify_staff_failed", reason: cause instanceof Error ? cause.name : "unknown" });
  }
}
