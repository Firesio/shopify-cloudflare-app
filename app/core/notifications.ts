import { defineNotifications } from "@firesio/notify";

/**
 * Which notifications this app sends (`@firesio/notify`): who reads each, the channels it may use with their defaults and
 * the content key. A type is a closed key, so a typo is a compile error instead of a silent no-send. The transports are
 * composed in `wiring/notifications.ts` (email here; add a `push` channel there and a `push: "on"` here for Web Push).
 */
export const NOTIFICATIONS = defineNotifications({
  "support.staff_reply": { audience: "customer", channels: { email: "on" }, content: "mail.support_reply", storeCanToggle: false },
  "support.merchant_activity": { audience: "staff", channels: { email: "on" }, content: "mail.support_activity", storeCanToggle: false },
});

export type NotificationType = keyof typeof NOTIFICATIONS;
