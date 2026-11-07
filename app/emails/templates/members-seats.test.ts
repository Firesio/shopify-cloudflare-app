import { describe, expect, it } from "vitest";
import { audienceTextOf } from "~/test/audience";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { membersSeatsTrimmedEmail, membersSeatTrimNoticeEmail } from "./members-seats";

const notice = SAMPLE_PAYLOADS.members_seat_trim_notice;
const trimmed = SAMPLE_PAYLOADS.members_seats_trimmed;

describe("the seat notice email", () => {
  it("says the numbers, who would lose their seat, when, and what to do, in both parts", async () => {
    const email = await membersSeatTrimNoticeEmail(notice, await audienceTextOf(undefined, "email.members-seats"));
    expect(email.subject).toBe("Action needed: your team is over its seat limit");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Alpha Store");
      expect(part).toContain("Seats on your plan: 3");
      expect(part).toContain("People using one now: 5");
      expect(part).toContain("Ada Lovelace");
      // A person with no name is shown by address, never as "null".
      expect(part).toContain("viewer@alpha.example");
      expect(part).not.toContain("null");
      expect(part).toContain("https://app.workmanjsc.vn/app/members");
      expect(part).toContain("https://app.workmanjsc.vn/app/billing");
    }
  });

  it("writes the deadline in the reader's language and the shop's own zone, not the server's", async () => {
    const instant = Date.UTC(2027, 0, 15, 23, 30);
    const inEnglish = await membersSeatTrimNoticeEmail({ ...notice, deadlineAt: instant, timeZone: "Asia/Ho_Chi_Minh" }, await audienceTextOf("en", "email.members-seats"));
    const inSpanish = await membersSeatTrimNoticeEmail({ ...notice, deadlineAt: instant, timeZone: "Asia/Ho_Chi_Minh" }, await audienceTextOf("es", "email.members-seats"));
    // 23:30 UTC is 06:30 the next morning in Ho Chi Minh City.
    expect(inEnglish.text).toContain("Jan 16, 2027");
    expect(inEnglish.text).toContain("6:30");
    expect(inSpanish.text).toContain("16 ene 2027");
    expect(inSpanish.text).toContain("6:30");
  });

  it("counts the people it does not name, and says nothing about more when there are none", async () => {
    const text = await audienceTextOf(undefined, "email.members-seats");
    expect((await membersSeatTrimNoticeEmail({ ...notice, morePeople: 4 }, text)).text).toContain("And 4 more.");
    expect((await membersSeatTrimNoticeEmail(notice, text)).text).not.toContain("more.");
  });

  it("falls back to words for a person with neither a name nor an address", async () => {
    const email = await membersSeatTrimNoticeEmail({ ...notice, people: [{ name: null, email: null }] }, await audienceTextOf(undefined, "email.members-seats"));
    expect(email.text).toContain("A staff member without a name");
  });

  it("is written in Spanish for a Spanish reader, with every placeholder filled", async () => {
    const email = await membersSeatTrimNoticeEmail(notice, await audienceTextOf("es", "email.members-seats"));
    expect(email.subject).toBe("Acción necesaria: tu equipo supera el límite de plazas");
    expect(email.text).toContain("Plazas de tu plan: 3");
    expect(email.text).not.toContain("{{");
  });

  it("leaves the plan page as a link to copy, so it works with styles and images off", async () => {
    const email = await membersSeatTrimNoticeEmail(notice, await audienceTextOf(undefined, "email.members-seats"));
    expect(email.text).toContain("Change your plan: https://app.workmanjsc.vn/app/billing");
  });
});

describe("the seats-trimmed email", () => {
  it("names who lost their seat and how they come back", async () => {
    const email = await membersSeatsTrimmedEmail(trimmed, await audienceTextOf(undefined, "email.members-seats"));
    expect(email.subject).toBe("Some people lost their seat");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Ada Lovelace");
      expect(part).toContain("viewer@alpha.example");
      expect(part).toContain("And 1 more.");
      expect(part).toContain("lets them back in on the Team page");
      expect(part).toContain("https://app.workmanjsc.vn/app/members");
    }
  });

  it("is written in Spanish for a Spanish reader, with every placeholder filled", async () => {
    const email = await membersSeatsTrimmedEmail(trimmed, await audienceTextOf("es", "email.members-seats"));
    expect(email.subject).toBe("Algunas personas han perdido su plaza");
    expect(email.text).toContain("readmita en la página Equipo");
    expect(email.text).not.toContain("{{");
  });
});
