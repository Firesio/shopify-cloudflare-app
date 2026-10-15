/**
 * Where a visitor goes to install the app.
 *
 * Shopify requires installation to start on a Shopify-owned surface and forbids
 * asking for a shop's myshopify.com domain during install (App Store
 * requirement 2.3.1). So once the app has a public listing, every "Install"
 * button points at it. Before then — in development, or while the listing is in
 * review — there is nothing to point at, and the manual shop-domain form is the
 * only way in. The two are different flows, not one flow with a toggle:
 *
 *   appStore — the listing URL, no form anywhere, /auth/login never shows one
 *   manual   — the shop-domain form on the landing page and on /auth/login
 *
 * Pure: the handle comes in as a parameter (it is deploy configuration, the
 * `SHOPIFY_APP_HANDLE` var), never read from the environment here.
 */
export type InstallTarget =
  | { readonly kind: "appStore"; readonly url: string }
  | { readonly kind: "manual"; readonly reason: "unset" | "invalid" };

const APP_STORE_BASE = "https://apps.shopify.com/";

/** The slug in `apps.shopify.com/<handle>`: lowercase letters, digits and hyphens, never leading or trailing with one. */
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function installTarget(handle: string | undefined): InstallTarget {
  const trimmed = (handle ?? "").trim();
  if (trimmed === "") return { kind: "manual", reason: "unset" };
  // A typo must never become a broken or foreign URL on a public page: it falls
  // back to the manual form, and the caller logs `reason: "invalid"`.
  if (!HANDLE_PATTERN.test(trimmed)) return { kind: "manual", reason: "invalid" };
  return { kind: "appStore", url: `${APP_STORE_BASE}${trimmed}` };
}
