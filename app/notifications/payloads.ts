import type { LanguageTag } from "~/lib/language/tag";
import type { NotificationEvent } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// PER-EVENT PAYLOADS — the data a notification carries, independent of how any
// channel renders it.
//
// CHANNEL-NEUTRAL on purpose. An email builder and an SMS builder are two
// renderings of the SAME facts, so the facts do not belong to either of them. If
// this lived in `emails/`, adding SMS would mean either importing the email
// module for its types or duplicating the payload — and a duplicated payload
// drifts.
//
// Client-safe: types only, no renderers, no server imports.
//
// One payload per event, never one flat bag with everything optional. A flat
// `TemplateData` grows to twenty-odd fields, a renderer's signature stops saying
// what it actually reads, and a field every renderer silently ignores looks
// wired up.
// ─────────────────────────────────────────────────────────────────────────────

/** What every notification can rely on. */
export interface BasePayload {
  /** Recipient's display name, for the greeting. */
  recipientName: string;
  /**
   * What is known about the language of the person this goes to, parsed at the edge into a canonical tag. Only an event
   * whose email is meant for its recipient's language reads it (`emails/registry.server.ts`); staff-facing events are fixed.
   */
  language?: LanguageTag;
  /** Absolute URL to a brand mark, when the channel can show one. */
  logoUrl?: string;
}

export interface AdminPasswordResetPayload extends BasePayload {
  /** The full reset URL, already built — renderers never construct links. */
  resetUrl: string;
  /** Already formatted for the recipient; a renderer does not know a locale's rules. */
  expiresIn: string;
}

/** Shared by both support notifications: the same thread, two audiences. */
interface SupportPayload extends BasePayload {
  /** The merchant's own words for what this is about. */
  subject: string;
  /**
   * A short excerpt of the new message, already truncated by the caller.
   * Renderers do not trim: where to cut is a content decision, and doing it in
   * the template means every channel invents its own length.
   */
  excerpt: string;
  /** Where to read and answer it. Built by the caller — templates never make links. */
  threadUrl: string;
}

export interface SupportMerchantActivityPayload extends SupportPayload {
  /** Which shop, so a staff inbox is triageable from the subject line alone. */
  shopName: string;
  /** Opened vs replied — the same facts, but a different thing to do about it. */
  isNew: boolean;
}

export interface SupportStaffReplyPayload extends SupportPayload {
  /** Who answered, so the merchant sees a person rather than an app. */
  staffName: string;
  /** The ticket's own id: the stable identity of the stored text (its subject) that a localizer may translate. */
  ticketId: string;
}

/** Shared by both shop notifications: the same shop, a different thing that happened to it. */
interface ShopChangePayload extends BasePayload {
  /** The merchant's own name for the shop; the domain when Shopify has not told us one yet. */
  shopName: string;
  /** The myshopify.com domain, the shop's identity everywhere else. */
  shop: string;
  /** When it happened, already formatted for the staff reading it. */
  occurredAt: string;
  /** Where to look the shop up in the internal console. Built by the caller — templates never make links. */
  adminUrl: string;
}

export type ShopInstalledPayload = ShopChangePayload;
export type ShopUninstalledPayload = ShopChangePayload;

/** A webhook that will not be retried again. Ids and names only: never the payload, never the failure text. */
export interface WebhookDeadLetterPayload extends BasePayload {
  shopName: string;
  /** The myshopify.com domain. */
  shop: string;
  /** The webhook topic, e.g. `shop/redact`. */
  topic: string;
  /** `X-Shopify-Webhook-Id`: how the delivery is found in the failures API and the inbox. */
  deliveryId: string;
  occurredAt: string;
  adminUrl: string;
}

/** A test message carries no data: its copy is fixed. */
export type PushTestPayload = BasePayload;

/**
 * Event → payload.
 *
 * Typed as a `Record<NotificationEvent, …>`, so adding an event to the union
 * without describing its data is a compile error.
 */
export interface PayloadByEvent extends Record<NotificationEvent, BasePayload> {
  admin_password_reset: AdminPasswordResetPayload;
  support_merchant_activity: SupportMerchantActivityPayload;
  support_staff_reply: SupportStaffReplyPayload;
  shop_installed: ShopInstalledPayload;
  shop_uninstalled: ShopUninstalledPayload;
  webhook_dead_letter: WebhookDeadLetterPayload;
  push_test: PushTestPayload;
}
