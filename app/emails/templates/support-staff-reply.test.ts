import { describe, expect, it } from "vitest";
import { supportStaffReplyEmail } from "./support-staff-reply";
import type { ContentLocalizer } from "~/lib/language/audience";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { createAudienceTextFor, defaultAudienceDeps } from "~/wiring/audience.server";
import { parseLanguageTag } from "~/lib/language/tag";
import { audienceTextOf } from "~/test/audience";

const PAYLOAD = {
  recipientName: "Ada",
  subject: "Question",
  excerpt: "We can help.",
  threadUrl: "https://example.org/support/1",
  ticketId: "1",
  staffName: "Support",
} as const;

describe("merchant support reply email", () => {
  it("uses the localized sender disclosure from the email catalogue", async () => {
    const email = await supportStaffReplyEmail(PAYLOAD, await audienceTextOf("es", "email.support-reply"));

    expect(email.html).toContain("Este correo fue enviado por el soporte de TODO: Your App Name.");
    expect(email.html).not.toContain("TODO: your footer line");
  });

  // B6: the subject line used to ignore the localized subject the heading showed.
  it("puts the SAME localized subject on the subject line and in the heading", async () => {
    const localizer: ContentLocalizer<LanguageCode> = {
      localize: (ref, language) => Promise.resolve(language === "es" ? `${ref.original} (traducido)` : ref.original),
    };
    const es = parseLanguageTag("es");
    const text = await createAudienceTextFor({ ...defaultAudienceDeps(), localizer })({ unit: "email.support-reply", evidence: es === null ? [] : [es] });
    const email = await supportStaffReplyEmail(PAYLOAD, text);

    expect(email.subject).toBe("Re: Question (traducido)");
    expect(email.html).toContain("Question (traducido)");
    expect(email.html).not.toContain(">Question<");
  });

  it("keeps the ticket's own subject when nothing translates it", async () => {
    const email = await supportStaffReplyEmail(PAYLOAD, await audienceTextOf("es", "email.support-reply"));
    expect(email.subject).toBe("Re: Question");
    expect(email.html).toContain("Question");
  });
});
