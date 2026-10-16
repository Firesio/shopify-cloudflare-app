import { describe, expect, it } from "vitest";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { webhookDeadLetterEmail } from "./webhook-dead-letter";

describe("webhook dead-letter email", () => {
  it("puts the topic in the subject, because that is the only triage signal in a shared inbox", async () => {
    expect((await webhookDeadLetterEmail(SAMPLE_PAYLOADS.webhook_dead_letter)).subject).toBe("Webhook failed: shop/redact");
  });

  it("names the shop and the delivery id in both the HTML and the text part, and links to the shop", async () => {
    const email = await webhookDeadLetterEmail(SAMPLE_PAYLOADS.webhook_dead_letter);
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Alpha Store");
      expect(part).toContain("alpha.myshopify.com");
      expect(part).toContain("wh-123");
      expect(part).toContain("ran out of retries");
    }
    expect(email.html).toContain('href="https://app.workmanjsc.vn/internal/shops/alpha.myshopify.com"');
  });
});
