import { getEnv } from "~/request-context.server";
import { announceShopChange, type ShopChange } from "~/services/announce-shop-change";
import { announceWebhookDeadLetter, type WebhookDeadLetter } from "~/services/announce-webhook-dead-letter";
import { queuedNotifier } from "~/wiring/notifications.server";
import { shops } from "~/wiring/repositories.server";
import { staffNotificationRecipients } from "~/wiring/staff-notifications.server";

/**
 * Tells the staff a shop installed or uninstalled. Queued, so the request that observed it does not wait on a mail
 * provider or a push service, and each person hears on the channels their own settings pick.
 */
export function shopChangeAnnouncer(): (change: ShopChange) => Promise<void> {
  const ports = {
    notifier: queuedNotifier(),
    recipients: staffNotificationRecipients(),
    shopName: async (shop: string) => (await shops().get(shop))?.name ?? null,
    appUrl: getEnv().SHOPIFY_APP_URL,
  };
  return (change) => announceShopChange(ports, change);
}

/** Tells the staff a webhook was dead-lettered. Queued like every other staff notification. */
export function webhookDeadLetterAnnouncer(): (deadLetter: WebhookDeadLetter) => Promise<void> {
  const ports = {
    notifier: queuedNotifier(),
    recipients: staffNotificationRecipients(),
    shopName: async (shop: string) => (await shops().get(shop))?.name ?? null,
    appUrl: getEnv().SHOPIFY_APP_URL,
  };
  return (deadLetter) => announceWebhookDeadLetter(ports, deadLetter);
}
