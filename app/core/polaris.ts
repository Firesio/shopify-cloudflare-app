/**
 * The ONE place the Polaris release is named.
 *
 * The embedded app loads Polaris from Shopify's CDN. `polaris-2.js` is the stable Polaris 2 channel: it always serves the
 * newest 2.x, which matches the redesigned Shopify admin and follows whichever admin theme the merchant is using. Pin
 * `polaris-2.0.js` instead to freeze at exactly 2.0.
 *
 * The URL goes to TWO places that must agree, and both read this constant: `shopifyApp({ polarisUrl })` (the preload
 * `Link` header on every document response) and `AppProvider` (the script tag). If they differ, the browser preloads one
 * bundle and runs another. Never add a Polaris script tag of your own: two bundles on one page make the app throw.
 *
 * `@shopify/polaris-types` must be the same major (`^2.0.0` for this URL): the types describe the components the page
 * actually renders. A test holds the two together.
 */
export const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris-2.js";
