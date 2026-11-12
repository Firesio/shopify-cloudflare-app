import { describe, expect, it } from "vitest";
import { opensListing, outcomeOfResponse, REVIEW_DECLINED_CODES } from "./native-review";

describe("opensListing", () => {
  it("opens nothing when the modal was shown", () => {
    expect(opensListing({ kind: "shown" })).toBe(false);
  });

  it("opens nothing when a modal is already on screen, opening, cancelled, or they already reviewed", () => {
    for (const code of ["already-open", "open-in-progress", "cancelled", "already-reviewed"] as const) {
      expect(opensListing({ kind: "declined", code }), code).toBe(false);
    }
  });

  it("falls back to the listing whenever Shopify will not show the modal", () => {
    for (const code of ["mobile-app", "annual-limit-reached", "cooldown-period", "merchant-ineligible", "recently-installed"] as const) {
      expect(opensListing({ kind: "declined", code }), code).toBe(true);
    }
  });

  it("falls back to the listing when the API is unavailable", () => {
    expect(opensListing({ kind: "unavailable" })).toBe(true);
  });

  it("decides every documented code (a new code fails the build in the switch)", () => {
    for (const code of REVIEW_DECLINED_CODES) expect(() => opensListing({ kind: "declined", code })).not.toThrow();
  });
});

describe("outcomeOfResponse", () => {
  it("maps success and known codes", () => {
    expect(outcomeOfResponse({ success: true, code: "success" })).toEqual({ kind: "shown" });
    expect(outcomeOfResponse({ success: false, code: "cooldown-period" })).toEqual({ kind: "declined", code: "cooldown-period" });
  });

  it("degrades an unknown future code to a decline that opens the listing", () => {
    const outcome = outcomeOfResponse({ success: false, code: "brand-new-code" });
    expect(outcome).toEqual({ kind: "declined", code: "merchant-ineligible" });
    expect(opensListing(outcome)).toBe(true);
  });
});
