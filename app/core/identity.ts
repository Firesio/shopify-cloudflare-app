/**
 * Stable product identity shared by the public pages, the legal copy and the notifications. Pure: configured at
 * authoring time, never per request.
 *
 * `slug` is OUR OWN name for the app (lower case, hyphens): the `appSlug` on every event the portal receives and the slug the portal
 * declares the app by (`declared-apps.ts`, one PR to the Firesio platform repo). Never Shopify's app id. `npm run new-app` renames it with the rest.
 */
export const identity = Object.freeze({
  slug: "my-app",
  name: "TODO: Your App Name",
  brandName: "TODO: Your App Name",
  companyName: "Firesio",
  // The app's logo on every mail that wears no shop brand: a file in `public/` (PNG, JPEG or WebP), or an https URL.
  // TODO: replace public/logo.png with the app's own logo (square, at least 64 px).
  logo: "/logo.png",
  contacts: Object.freeze({
    // The fallback only: an app's real address is derived from its own domain (`support@<app>.firesio.app`).
    supportEmail: "support@firesio.app",
  }),
  legal: Object.freeze({
    address: "TODO: Street, City, Region, Postcode, Country",
    effectiveDate: "TODO: YYYY-MM-DD",
  }),
} as const);
