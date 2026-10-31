/**
 * Stable product identity shared by public pages, legal copy, and notifications.
 * Keep this module pure: values are configured at authoring time, never per
 * request or from a runtime environment.
 */
export const identity = Object.freeze({
  name: "TODO: Your App Name",
  brandName: "TODO: Your App Name",
  companyName: "Firesio",
  contacts: Object.freeze({
    // The ONE contact address, for support and for privacy questions alike.
    // This is only the fallback: each app's real address is derived from its own
    // domain (`support@<app>.firesio.app`, see `supportEmailFor`), so it is shown
    // here only where an app URL cannot receive mail (local development).
    supportEmail: "support@firesio.app",
  }),
  legal: Object.freeze({
    address: "TODO: Street, City, Region, Postcode, Country",
    effectiveDate: "TODO: YYYY-MM-DD",
  }),
  copy: Object.freeze({
    tagline: Object.freeze({
      en: "TODO: Your localized product tagline",
      es: "TODO: El eslogan localizado de tu producto",
    }),
    emailSenderDisclosure: Object.freeze({
      en: "This email was sent by TODO: Your App Name support.",
      es: "Este correo fue enviado por el soporte de TODO: Your App Name.",
    }),
  }),
} as const);

export function emailSenderDisclosure(locale: Locale): string {
  return identity.copy.emailSenderDisclosure[locale];
}
import type { Locale } from "~/i18n/config";
