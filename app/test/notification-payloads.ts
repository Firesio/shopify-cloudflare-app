import type { PayloadByEvent } from "~/notifications/payloads";
import type { NotificationEvent } from "~/notifications/types";

/**
 * One realistic payload per event, keyed by the event union: adding an event stops this compiling until it has a
 * sample, so a test that walks every event can never skip the new one.
 */
export const SAMPLE_PAYLOADS: { readonly [E in NotificationEvent]: PayloadByEvent[E] } = {
  admin_password_reset: {
    recipientName: "Sam",
    resetUrl: "https://app.workmanjsc.vn/internal/reset/token",
    expiresIn: "one hour",
  },
  support_merchant_activity: {
    recipientName: "Sam",
    shopName: "Alpha Store",
    subject: "Checkout is broken",
    excerpt: "It fails at payment.",
    threadUrl: "https://app.workmanjsc.vn/internal/support/t-1",
    isNew: true,
  },
  support_staff_reply: {
    recipientName: "Alpha Store",
    staffName: "Sam",
    subject: "Checkout is broken",
    excerpt: "Fixed.",
    threadUrl: "https://app.workmanjsc.vn/app/support/t-1",
  },
  shop_installed: {
    recipientName: "Sam",
    shopName: "Alpha Store",
    shop: "alpha.myshopify.com",
    occurredAt: "Oct 15, 2026, 9:30 AM",
    adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
  },
  shop_uninstalled: {
    recipientName: "Sam",
    shopName: "Alpha Store",
    shop: "alpha.myshopify.com",
    occurredAt: "Oct 15, 2026, 9:30 AM",
    adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
  },
  webhook_dead_letter: {
    recipientName: "Sam",
    shopName: "Alpha Store",
    shop: "alpha.myshopify.com",
    topic: "shop/redact",
    deliveryId: "wh-123",
    occurredAt: "Oct 15, 2026, 9:30 AM",
    adminUrl: "https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com",
  },
  push_test: { recipientName: "Staff" },
};
