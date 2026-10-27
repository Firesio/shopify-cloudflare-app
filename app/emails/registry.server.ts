import type { PayloadByEvent } from "~/notifications/payloads";
import type { NotificationEvent } from "~/notifications/types";
import type { AudienceText, AudienceTextFor } from "~/i18n/audience";
import type { TextUnit } from "~/i18n/text-units";
import type { RenderedEmail } from "./render";
import { adminPasswordResetEmail } from "./templates/admin-password-reset";
import { shopInstalledEmail, shopUninstalledEmail } from "./templates/shop-change";
import { webhookDeadLetterEmail } from "./templates/webhook-dead-letter";
import { supportMerchantActivityEmail } from "./templates/support-merchant-activity";
import { supportStaffReplyEmail } from "./templates/support-staff-reply";

// ─────────────────────────────────────────────────────────────────────────────
// EVENT → EMAIL BUILDER.
//
// `.server.ts` on purpose: this pulls in the whole React Email render tree, and
// `notifications/catalogue.ts` and `notifications/payloads.ts` stay client-safe so
// a settings screen can list events without any of it reaching the browser bundle.
//
// The mapped key type is what makes this extensible safely: add an event to
// `NotificationEvent` and THIS OBJECT stops compiling until it has a builder. A
// plain lookup returning `undefined` would instead give a silent no-send — the
// notification never arrives and nothing anywhere throws.
// ─────────────────────────────────────────────────────────────────────────────

/** Renders one event's payload as an email, in the reader's language (`text`). Pure apart from rendering. */
type EmailBuilder<E extends NotificationEvent> = (
  payload: PayloadByEvent[E],
  text: AudienceText,
) => Promise<RenderedEmail>;

// `null` where the event has no email rendering (it is push-only). The `null` entries must agree with the catalogue's
// `channels`; a test holds them to it.
const BUILDERS: { [E in NotificationEvent]: EmailBuilder<E> | null } = {
  admin_password_reset: adminPasswordResetEmail,
  support_merchant_activity: supportMerchantActivityEmail,
  support_staff_reply: supportStaffReplyEmail,
  shop_installed: shopInstalledEmail,
  shop_uninstalled: shopUninstalledEmail,
  webhook_dead_letter: webhookDeadLetterEmail,
  push_test: null,
};

/**
 * The text unit each event's email needs in one language (`~/i18n/text-units`): the reader is only shown a language that
 * has the whole unit. Typed over every event, so a new event cannot forget one.
 */
const UNITS: { [E in NotificationEvent]: TextUnit } = {
  admin_password_reset: "email.layout",
  support_merchant_activity: "email.layout",
  support_staff_reply: "email.support-reply",
  shop_installed: "email.layout",
  shop_uninstalled: "email.layout",
  webhook_dead_letter: "email.layout",
  push_test: "email.layout",
};

/**
 * Build one event's email. Each builder receives exactly ITS event's payload.
 *
 * Eligibility refuses a channel the catalogue does not list for an event, so a missing builder here is a broken
 * invariant — a catalogue entry without a builder — and throws rather than quietly sending nothing.
 */
export async function buildEmail<E extends NotificationEvent>(
  event: E,
  payload: PayloadByEvent[E],
  audienceTextFor: AudienceTextFor,
): Promise<RenderedEmail> {
  const build = BUILDERS[event];
  if (build === null) throw new Error(`The catalogue lists email for ${event}, which has no email template`);
  // The reader's language is the composition root's decision; the payload only says what it knows (`locale`).
  const text = await audienceTextFor({ unit: UNITS[event], evidence: [payload.locale] });
  return build(payload, text);
}
