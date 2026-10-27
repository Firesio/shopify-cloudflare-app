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
  companyName: "TODO: Your Legal Entity Name",
  contacts: Object.freeze({
    supportEmail: "TODO: support@example.com",
    privacyEmail: "TODO: privacy@example.com",
  }),
  legal: Object.freeze({
    address: "TODO: Street, City, Region, Postcode, Country",
    effectiveDate: "TODO: YYYY-MM-DD",
  }),
} as const);
