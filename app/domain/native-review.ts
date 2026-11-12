/**
 * The native review modal: `shopify.reviews.request()` in App Home. PURE.
 *
 * Verified against https://shopify.dev/docs/api/app-home/v2.0/apis/user-interface-and-interactions/reviews-api and
 * https://shopify.dev/docs/apps/launch/marketing/manage-app-reviews (2026-11-12): the call resolves to
 * `{ success: true, code: "success", message }` when the modal was shown, or `{ success: false, code, message }` when
 * Shopify declined. A decline RESOLVES (it does not reject); a rejected promise is an unexpected error. Shopify applies its
 * own rate limits and eligibility, so a decline is normal and never an error of ours; a development store bypasses them.
 *
 * The docs advise against tying the request to a merchant's click, because a declined one makes the app look broken. The
 * answer here is the fallback in `opensListing`: when no modal will appear, the click opens the listing's review page
 * instead, so it always leads somewhere.
 */
export const REVIEW_DECLINED_CODES = [
  "mobile-app",
  "already-reviewed",
  "annual-limit-reached",
  "cooldown-period",
  "merchant-ineligible",
  "recently-installed",
  "already-open",
  "open-in-progress",
  "cancelled",
] as const;
export type ReviewDeclinedCode = (typeof REVIEW_DECLINED_CODES)[number];

/** What asking Shopify came to. `unavailable` = the call threw or the API is absent. */
export type NativeReviewOutcome =
  | { readonly kind: "shown" }
  | { readonly kind: "declined"; readonly code: ReviewDeclinedCode }
  | { readonly kind: "unavailable" };

/** Whether the click must open the listing's review page: true only when no modal is on screen and none is coming. */
export function opensListing(outcome: NativeReviewOutcome): boolean {
  if (outcome.kind === "shown") return false;
  if (outcome.kind === "unavailable") return true;
  switch (outcome.code) {
    // They reviewed already, or a modal is on screen, is opening, or was just closed: nothing to ask, and a tab on top is noise.
    case "already-reviewed":
    case "already-open":
    case "open-in-progress":
    case "cancelled":
      return false;
    case "mobile-app":
    case "annual-limit-reached":
    case "cooldown-period":
    case "merchant-ineligible":
    case "recently-installed":
      // Shopify will not show the modal: the click must still lead somewhere, or the app looks broken.
      return true;
    default:
      return assertNever(outcome.code);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled review declined code: ${String(value)}`);
}

/**
 * Narrows what `shopify.reviews.request()` resolved to. A response whose code is not one we know (Shopify adds codes)
 * degrades to a decline that opens the listing, never to a crash.
 */
export function outcomeOfResponse(response: { readonly success: boolean; readonly code: string }): NativeReviewOutcome {
  if (response.success) return { kind: "shown" };
  const code = REVIEW_DECLINED_CODES.find((known) => known === response.code);
  return code === undefined ? { kind: "declined", code: "merchant-ineligible" } : { kind: "declined", code };
}
