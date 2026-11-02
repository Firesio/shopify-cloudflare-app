import { describe, expect, it } from "vitest";
import { audienceTextOf } from "~/test/audience";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { campaignMessageEmail } from "./campaign-message";

const payload = SAMPLE_PAYLOADS.campaign_message;

describe("campaign message email", () => {
  it("uses the team's subject as the subject line, untouched", async () => {
    expect((await campaignMessageEmail(payload, await audienceTextOf(undefined, "email.campaign"))).subject).toBe("A big update is coming next week");
  });

  it("shows every paragraph in both the HTML and the text part", async () => {
    const email = await campaignMessageEmail(payload, await audienceTextOf(undefined, "email.campaign"));
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Next week we ship a redesigned dashboard.");
      expect(part).toContain("Nothing changes until you open it.");
    }
  });

  it("carries the unsubscribe link in both parts, so it is findable with images and styles off", async () => {
    const email = await campaignMessageEmail(payload, await audienceTextOf(undefined, "email.campaign"));
    expect(email.html).toContain('href="https://app.workmanjsc.vn/unsubscribe/token"');
    expect(email.text).toContain("https://app.workmanjsc.vn/unsubscribe/token");
    expect(email.html).toContain("Unsubscribe from announcements");
  });

  it("says why the merchant is getting it, naming their shop", async () => {
    const email = await campaignMessageEmail(payload, await audienceTextOf(undefined, "email.campaign"));
    expect(email.text).toContain("because Alpha Store uses");
  });

  it("adds a button with a copyable link when the announcement has one", async () => {
    const email = await campaignMessageEmail(payload, await audienceTextOf(undefined, "email.campaign"));
    expect(email.html).toContain('href="https://app.workmanjsc.vn/news/big-update"');
    expect(email.text).toContain("See what is new");
    expect(email.text).toContain("https://app.workmanjsc.vn/news/big-update");
  });

  it("leaves the button out when there is none", async () => {
    const { ctaLabel: _label, ctaUrl: _url, ...withoutButton } = payload;
    const email = await campaignMessageEmail(withoutButton, await audienceTextOf(undefined, "email.campaign"));
    expect(email.html).not.toContain("news/big-update");
    expect(email.html).not.toContain("Or copy this link");
  });

  it("writes what the team typed as text, never as markup", async () => {
    const hostile = { ...payload, subject: "Hi <b>there</b>", body: '<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>' };
    const email = await campaignMessageEmail(hostile, await audienceTextOf(undefined, "email.campaign"));
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
