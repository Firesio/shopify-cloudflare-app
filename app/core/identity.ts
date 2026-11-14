/**
 * Stable product identity shared by the public pages, the legal copy and the notifications. Pure: configured at
 * authoring time, never per request.
 *
 * `slug` is OUR OWN name for the app (lower case, hyphens): the `appSlug` on every event the portal receives and the slug on
 * the portal's `/apps` page. Never Shopify's app id. `npm run new-app` renames it with the rest.
 */
export const identity = Object.freeze({
  slug: "my-app",
  name: "TODO: Your App Name",
  brandName: "TODO: Your App Name",
  companyName: "Firesio",
  contacts: Object.freeze({
    // The fallback only: an app's real address is derived from its own domain (`support@<app>.firesio.app`).
    supportEmail: "support@firesio.app",
  }),
  legal: Object.freeze({
    address: "TODO: Street, City, Region, Postcode, Country",
    effectiveDate: "TODO: YYYY-MM-DD",
  }),
} as const);
