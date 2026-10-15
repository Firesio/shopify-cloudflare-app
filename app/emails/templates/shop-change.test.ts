import { describe, expect, it } from "vitest";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { shopInstalledEmail, shopUninstalledEmail } from "./shop-change";

describe("shop install and uninstall emails", () => {
  it("puts the shop in the subject, because that is the only triage signal in a shared inbox", async () => {
    expect((await shopInstalledEmail(SAMPLE_PAYLOADS.shop_installed)).subject).toBe("New install: Alpha Store");
    expect((await shopUninstalledEmail(SAMPLE_PAYLOADS.shop_uninstalled)).subject).toBe("Uninstall: Alpha Store");
  });

  it("says what happened, to which shop and when, in both the HTML and the text part", async () => {
    const email = await shopInstalledEmail(SAMPLE_PAYLOADS.shop_installed);
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Alpha Store");
      expect(part).toContain("alpha.myshopify.com");
      expect(part).toContain("installed the app");
      expect(part).toContain("Oct 15, 2026, 9:30 AM");
    }
    expect((await shopUninstalledEmail(SAMPLE_PAYLOADS.shop_uninstalled)).text).toContain("uninstalled the app");
  });

  it("links to the shop in the console", async () => {
    const email = await shopUninstalledEmail(SAMPLE_PAYLOADS.shop_uninstalled);
    expect(email.html).toContain('href="https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com"');
  });
});
