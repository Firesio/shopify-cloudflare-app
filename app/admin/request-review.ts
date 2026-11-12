import { opensListing, outcomeOfResponse, type NativeReviewOutcome } from "~/domain/native-review";

/** Asks Shopify for the review modal. A thrown error (API absent, bridge not ready) is `unavailable`, never an uncaught rejection. */
async function requestNativeReview(): Promise<NativeReviewOutcome> {
  try {
    return outcomeOfResponse(await globalThis.shopify.reviews.request());
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * What the merchant's click on a review link does: ask Shopify to open its review modal over the admin, and only when Shopify
 * will not show one (rate limit, eligibility, no bridge) open the listing's review page in a new tab. Browser only.
 */
export async function askForReview(listingReviewUrl: string): Promise<void> {
  if (opensListing(await requestNativeReview())) window.open(listingReviewUrl, "_blank", "noopener,noreferrer");
}
