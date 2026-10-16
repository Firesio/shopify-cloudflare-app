import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Notifier } from "~/ports/notifier";
import type { StaffNotificationRecipients } from "~/ports/staff-notifications";

/** A delivery the queue consumer has given up on. Identity only: no payload, no failure text. */
export interface WebhookDeadLetter {
  readonly shop: string;
  readonly deliveryId: string;
  readonly topic: string;
  /** Epoch ms at which it was dead-lettered, shown to the staff. */
  readonly occurredAt: number;
}

export interface AnnounceWebhookDeadLetterPorts {
  readonly notifier: Notifier;
  readonly recipients: StaffNotificationRecipients;
  /** The merchant's name for the shop, when we know it. */
  readonly shopName: (shop: string) => Promise<string | null>;
  readonly appUrl: string;
}

/**
 * Tell the staff who asked to hear about it that a webhook was dead-lettered: one email request per person who wants
 * email and one push request per enabled device of each person who wants push, per their own settings.
 *
 * The dedupe key is the delivery id, so a redelivered queue message or a second consumer announces once. THROWS if
 * reading who to tell fails; the consumer treats the announcement as decoration and catches, so a failed announcement
 * never changes what happens to the delivery.
 */
export async function announceWebhookDeadLetter(ports: AnnounceWebhookDeadLetterPorts, deadLetter: WebhookDeadLetter): Promise<void> {
  const recipients = await ports.recipients.recipientsFor("webhook_dead_letter");
  if (recipients.emails.length === 0 && recipients.devices.length === 0) return;

  const base = ports.appUrl.replace(/\/+$/, "");
  const content = {
    shopName: (await ports.shopName(deadLetter.shop)) ?? deadLetter.shop,
    shop: deadLetter.shop,
    topic: deadLetter.topic,
    deliveryId: deadLetter.deliveryId,
    occurredAt: formatDateTime("en", deadLetter.occurredAt, UTC),
    adminUrl: `${base}/internal/shops/${encodeURIComponent(deadLetter.shop)}`,
  };
  const request = { event: "webhook_dead_letter" as const, scope: deadLetter.shop, dedupeKey: `webhook-dead-letter:${deadLetter.deliveryId}` };

  await Promise.all([
    ...recipients.emails.map((recipient) =>
      ports.notifier.send({ ...request, to: { email: recipient.email }, payload: { recipientName: recipient.name, ...content } }),
    ),
    ...recipients.devices.map((device) =>
      ports.notifier.send({ ...request, to: { push: device.subscriptionId }, payload: { recipientName: "Staff", ...content } }),
    ),
  ]);
}
