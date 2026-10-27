import type { PayloadByEvent } from "~/notifications/payloads";
import type { NotificationEvent } from "~/notifications/types";
import type { AudienceText, TextBuilders } from "~/i18n/audience";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from "~/i18n/catalogues.generated";
import { audienceLanguage, merchantLanguage, type AudienceLanguage } from "~/i18n/roles";
import { negotiate } from "~/lib/language/negotiate";
import type { TextUnit, UnitKeys } from "~/i18n/text-units";
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
// `NotificationEvent` and THESE OBJECTS stop compiling until they have a builder, a
// text unit and a language source. A plain lookup returning `undefined` would instead
// give a silent no-send — the notification never arrives and nothing anywhere throws.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where an email's language comes from, and so which builder writes it:
 *  - `fixed`: the app's own choice, written by the CUSTOMER builder (staff mail is in the default language, whatever the
 *    payload says);
 *  - `merchant`: the person it is sent to is the MERCHANT, who reads the language they work in (the payload's `language`,
 *    the one stored when they opened the ticket), written by the MERCHANT builder: never a shop's customer languages or
 *    customer-facing layers.
 * An app adding mail to its customers adds a source for them, which goes through the audience builder with the shop.
 */
type LanguageSource = { readonly kind: "fixed"; readonly language: AudienceLanguage } | { readonly kind: "merchant" };

const STAFF: LanguageSource = { kind: "fixed", language: audienceLanguage(DEFAULT_LANGUAGE) };
const MERCHANT: LanguageSource = { kind: "merchant" };

/**
 * What each event's email needs: the text unit (`~/i18n/text-units`, the only keys its builder may use) and where its
 * language comes from. Typed over every event, so a new event cannot forget either.
 */
const EMAILS = {
  admin_password_reset: { unit: "email.layout", language: STAFF },
  support_merchant_activity: { unit: "email.layout", language: STAFF },
  support_staff_reply: { unit: "email.support-reply", language: MERCHANT },
  shop_installed: { unit: "email.layout", language: STAFF },
  shop_uninstalled: { unit: "email.layout", language: STAFF },
  webhook_dead_letter: { unit: "email.layout", language: STAFF },
  push_test: { unit: "email.layout", language: STAFF },
} as const satisfies { [E in NotificationEvent]: { readonly unit: TextUnit; readonly language: LanguageSource } };

type UnitOf<E extends NotificationEvent> = (typeof EMAILS)[E]["unit"];

/** Renders one event's payload as an email, with the text of ITS unit. Pure apart from rendering. */
type EmailBuilder<E extends NotificationEvent> = (
  payload: PayloadByEvent[E],
  text: AudienceText<UnitKeys<UnitOf<E>>>,
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
 * Build one event's email. Each builder receives exactly ITS event's payload and the text of ITS unit.
 *
 * Eligibility refuses a channel the catalogue does not list for an event, so a missing builder here is a broken
 * invariant — a catalogue entry without a builder — and throws rather than quietly sending nothing.
 */
export async function buildEmail<E extends NotificationEvent>(
  event: E,
  payload: PayloadByEvent[E],
  texts: TextBuilders,
  shop?: string,
): Promise<RenderedEmail> {
  const build = BUILDERS[event];
  if (build === null) throw new Error(`The catalogue lists email for ${event}, which has no email template`);
  const { unit } = EMAILS[event];
  const source: LanguageSource = EMAILS[event].language;
  // Whose language it is, and so which builder: the composition root decides the rest. `shop` is what customer mail needs
  // for its per-shop seams; the merchant's own mail has none.
  const text =
    source.kind === "fixed"
      ? await texts.audienceTextFor({ unit, fixed: source.language, ...(shop === undefined ? {} : { shop }) })
      : await texts.merchantTextFor({ unit, language: merchantLanguage(negotiate(payload.language === undefined ? [] : [payload.language], LANGUAGE_CODES, DEFAULT_LANGUAGE)) });
  return build(payload, text);
}
