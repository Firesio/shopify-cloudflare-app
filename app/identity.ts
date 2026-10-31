/**
 * Stable product identity shared by public pages, legal copy, and notifications.
 * Keep this module pure: values are configured at authoring time, never per
 * request or from a runtime environment.
 *
 * Words that need a translation (the tagline, the email sender disclosure) are NOT here: they live in
 * `app/i18n/locales/<code>/` like every other string, and `name` reaches them as `{{appName}}`.
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
} as const);
