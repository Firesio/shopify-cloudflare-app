import { describe, expect, it } from "vitest";
import { appReviewUrl, installTarget } from "./install-target";

describe("installTarget", () => {
  it("is manual when no handle is configured", () => {
    expect(installTarget(undefined)).toEqual({ kind: "manual", reason: "unset" });
    expect(installTarget("")).toEqual({ kind: "manual", reason: "unset" });
    expect(installTarget("   ")).toEqual({ kind: "manual", reason: "unset" });
  });

  it("points at the App Store listing once a handle is set", () => {
    expect(installTarget("my-app")).toEqual({ kind: "appStore", url: "https://apps.shopify.com/my-app" });
    expect(installTarget("app2")).toEqual({ kind: "appStore", url: "https://apps.shopify.com/app2" });
    expect(installTarget("a")).toEqual({ kind: "appStore", url: "https://apps.shopify.com/a" });
    expect(installTarget("my--app")).toEqual({ kind: "appStore", url: "https://apps.shopify.com/my--app" });
  });

  it("ignores surrounding whitespace in the configured value", () => {
    expect(installTarget("  my-app\n")).toEqual({ kind: "appStore", url: "https://apps.shopify.com/my-app" });
  });

  it("never builds a URL from something that is not a handle", () => {
    for (const bad of [
      "My-App",
      "my_app",
      "my app",
      "-leading",
      "trailing-",
      "evil.com/phish",
      "../admin",
      "app?x=1",
      "https://apps.shopify.com/my-app",
      "app\u0000",
    ]) {
      expect(installTarget(bad), bad).toEqual({ kind: "manual", reason: "invalid" });
    }
  });
});

describe("appReviewUrl", () => {
  it("is the listing with Shopify's review-modal deep link", () => {
    expect(appReviewUrl("my-app")).toBe("https://apps.shopify.com/my-app#modal-show=WriteReviewModal");
  });

  it("is null without a usable handle, so no dead or foreign link is ever shown", () => {
    expect(appReviewUrl(undefined)).toBeNull();
    expect(appReviewUrl("")).toBeNull();
    expect(appReviewUrl("evil.com/phish")).toBeNull();
  });
});
