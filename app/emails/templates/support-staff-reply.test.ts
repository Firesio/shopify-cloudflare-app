import { describe, expect, it } from "vitest";
import { supportStaffReplyEmail } from "./support-staff-reply";

describe("merchant support reply email", () => {
  it("uses the localized sender disclosure from product identity", async () => {
    const email = await supportStaffReplyEmail({
      recipientName: "Ada",
      subject: "Question",
      excerpt: "We can help.",
      threadUrl: "https://example.org/support/1",
      staffName: "Support",
      locale: "es",
    });

    expect(email.html).toContain("Este correo fue enviado por el soporte de TODO: Your App Name.");
    expect(email.html).not.toContain("TODO: your footer line");
  });
});
