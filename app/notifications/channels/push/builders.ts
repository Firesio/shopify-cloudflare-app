import type { PayloadByEvent } from "../../payloads";
import { staffTopicForSupportActivity } from "../../staff-topic";
import type { NotificationEvent, PushMessage } from "../../types";
import { lastSegment, toInternalPath } from "./internal-path";

/** What a push builder decides; the recipient is added by the composer. */
export type PushContent = Omit<PushMessage, "kind" | "to">;

type PushBuilder<E extends NotificationEvent> = (payload: PayloadByEvent[E]) => PushContent;

/**
 * How long the push service holds a message for a device that is offline. A support request is still worth reading
 * the next morning; an install or uninstall is news for the next few hours, not for tomorrow; a test is only
 * meaningful while the person is waiting for it.
 */
const SUPPORT_TTL_SECONDS = 24 * 60 * 60;
const SHOP_TTL_SECONDS = 60 * 60;
const TEST_TTL_SECONDS = 60;

/**
 * EVENT → PUSH CONTENT, `null` where this channel does not render the event.
 *
 * Keyed by the event union, so a new event stops compiling until it says what its push looks like — or says
 * explicitly that it has none. The `null` entries must agree with the catalogue's `channels`; a test holds them to it.
 *
 * Urgency: support is `high` (a merchant is waiting on a person), shop events are `normal` (worth knowing, not
 * worth waking a phone that is saving battery).
 */
export const PUSH_BUILDERS: { [E in NotificationEvent]: PushBuilder<E> | null } = {
  admin_password_reset: null,
  support_staff_reply: null,

  support_merchant_activity: (payload) => {
    const url = toInternalPath(payload.threadUrl);
    return {
      title: `${payload.isNew ? "New support ticket" : "Merchant reply"} · ${payload.shopName}`,
      body: payload.isNew ? payload.subject : payload.excerpt || payload.subject,
      url,
      tag: `ticket:${lastSegment(url)}`,
      topic: staffTopicForSupportActivity(payload.isNew),
      urgency: "high",
      ttlSeconds: SUPPORT_TTL_SECONDS,
    };
  },

  shop_installed: (payload) => ({
    title: `New install · ${payload.shopName}`,
    body: `${payload.shop} · ${payload.occurredAt}`,
    url: toInternalPath(payload.adminUrl),
    tag: `shop:${payload.shop}:installed`,
    topic: "shop_installed",
    urgency: "normal",
    ttlSeconds: SHOP_TTL_SECONDS,
  }),

  shop_uninstalled: (payload) => ({
    title: `Uninstall · ${payload.shopName}`,
    body: `${payload.shop} · ${payload.occurredAt}`,
    url: toInternalPath(payload.adminUrl),
    tag: `shop:${payload.shop}:uninstalled`,
    topic: "shop_uninstalled",
    urgency: "normal",
    ttlSeconds: SHOP_TTL_SECONDS,
  }),

  push_test: () => ({
    title: "Test notification",
    body: "Push notifications are working on this device.",
    url: "/internal/notifications",
    tag: "staff-test",
    topic: "staff_test",
    urgency: "high",
    ttlSeconds: TEST_TTL_SECONDS,
  }),
};
