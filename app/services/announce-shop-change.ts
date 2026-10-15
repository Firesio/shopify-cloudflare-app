import type { StaffTopic } from "~/domain/staff-notification-topics";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Notifier } from "~/ports/notifier";
import type { StaffNotificationRecipients } from "~/ports/staff-notifications";

/** What happened to a shop. */
export type ShopChangeKind = "installed" | "uninstalled";

export interface ShopChange {
  readonly kind: ShopChangeKind;
  /** The myshopify.com domain. */
  readonly shop: string;
  /**
   * Names the occasion for the dedupe key: the same occasion always produces the same key, so a redelivery or a
   * concurrent observer of the same change announces once. For an uninstall, the moment Shopify says it happened.
   */
  readonly occasion: string;
  /** Epoch ms of the change, shown to the staff. */
  readonly occurredAt: number;
}

export interface AnnounceShopChangePorts {
  readonly notifier: Notifier;
  readonly recipients: StaffNotificationRecipients;
  /** The merchant's name for the shop, when we know it. */
  readonly shopName: (shop: string) => Promise<string | null>;
  readonly appUrl: string;
}

/** One entry per kind: the event it sends, the topic people subscribe to, and the key prefix. */
const SHOP_CHANGES: Readonly<
  Record<ShopChangeKind, { readonly event: "shop_installed" | "shop_uninstalled"; readonly topic: StaffTopic; readonly keyPrefix: string }>
> = {
  installed: { event: "shop_installed", topic: "shop_installed", keyPrefix: "shop-installed" },
  uninstalled: { event: "shop_uninstalled", topic: "shop_uninstalled", keyPrefix: "shop-uninstalled" },
};

/**
 * Tell the staff who asked to hear about it that a shop installed or uninstalled: one email request per person who
 * wants email and one push request per enabled device of each person who wants push, per their own settings.
 *
 * THROWS if reading who to tell fails; the callers (`afterAuth`, `recordUninstall`) treat an announcement as
 * decoration and catch, so a failed announcement never fails an install or an uninstall. The notifier itself never
 * rejects, so one bad enqueue cannot suppress the others.
 *
 * `scope` is the shop, so the shop's notification rows are erased with the rest of its data on `shop/redact`.
 */
export async function announceShopChange(ports: AnnounceShopChangePorts, change: ShopChange): Promise<void> {
  const spec = SHOP_CHANGES[change.kind];
  const recipients = await ports.recipients.recipientsFor(spec.topic);
  if (recipients.emails.length === 0 && recipients.devices.length === 0) return;

  const base = ports.appUrl.replace(/\/+$/, "");
  const content = {
    shopName: (await ports.shopName(change.shop)) ?? change.shop,
    shop: change.shop,
    occurredAt: formatDateTime("en", change.occurredAt, UTC),
    adminUrl: `${base}/internal/shops/${encodeURIComponent(change.shop)}`,
  };
  const request = { event: spec.event, scope: change.shop, dedupeKey: `${spec.keyPrefix}:${change.shop}:${change.occasion}` };

  await Promise.all([
    ...recipients.emails.map((recipient) =>
      ports.notifier.send({ ...request, to: { email: recipient.email }, payload: { recipientName: recipient.name, ...content } }),
    ),
    ...recipients.devices.map((device) =>
      ports.notifier.send({ ...request, to: { push: device.subscriptionId }, payload: { recipientName: "Staff", ...content } }),
    ),
  ]);
}
