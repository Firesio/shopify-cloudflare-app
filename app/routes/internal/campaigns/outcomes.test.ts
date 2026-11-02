import { describe, expect, it } from "vitest";
import { CONTENT_LIMITS, type ContentError, type ContentFault } from "~/domain/campaign";
import { faultText, fieldErrorsOf, invalidDraft, shops, startResult } from "./outcomes";
import { PAUSE_EXPLANATION, RECIPIENT_STATUSES, toRecipientStatus, totalOf } from "./display";
import { PAUSE_REASONS } from "~/domain/campaign-delivery";

describe("fieldErrorsOf", () => {
  it("keeps the first fault of each field, so a form can mark every field once", () => {
    const errors: ContentError[] = [
      { field: "name", fault: "required" },
      { field: "ctaUrl", fault: "invalidUrl" },
      { field: "name", fault: "tooLong" },
    ];
    expect(fieldErrorsOf(errors)).toEqual({ name: "required", ctaUrl: "invalidUrl" });
  });

  it("is what an invalid draft answers, as a failure (not a success) carrying the fields", () => {
    expect(invalidDraft([{ field: "body", fault: "required" }])).toEqual({
      result: { kind: "failed", message: expect.stringContaining("need fixing"), fields: { body: "required" } },
    });
  });
});

describe("faultText", () => {
  it("names the field and, for a length, the limit", () => {
    expect(faultText("subject", "tooLong")).toBe(`Subject is too long (at most ${CONTENT_LIMITS.subject} characters).`);
    expect(faultText("body", "tooLong")).toContain("5,000");
    expect(faultText("name", "required")).toBe("Name is required.");
  });

  it("says something for every fault", () => {
    const faults: ContentFault[] = ["required", "tooLong", "invalidUrl", "buttonIncomplete"];
    for (const fault of faults) expect(faultText("ctaUrl", fault).length).toBeGreaterThan(10);
  });
});

describe("startResult", () => {
  it("says how many shops it is sending to", () => {
    expect(startResult({ ok: true, recipients: 1 }, 1)).toEqual({ result: { kind: "done", message: expect.stringContaining("1 shop.") } });
    expect(startResult({ ok: true, recipients: 1234 }, 1234)).toEqual({ result: { kind: "done", message: expect.stringContaining("1,234 shops") } });
  });

  it("names both numbers when the audience changed, and says nothing was sent", () => {
    const outcome = startResult({ ok: false, reason: "audience_changed", recipients: 12 }, 10);
    expect(outcome).toEqual({ result: { kind: "failed", message: expect.stringMatching(/reaches 12 shops, not the 10 you were shown. Nothing was sent/), fields: {} } });
  });

  it("fails, in its own words, for every other reason", () => {
    const reasons = ["not_found", "not_draft", "no_recipients", "changed"] as const;
    const messages = reasons.map((reason) => {
      const outcome = startResult({ ok: false, reason }, 5);
      return "result" in outcome && outcome.result.kind === "failed" ? outcome.result.message : "";
    });
    expect(new Set(messages).size).toBe(reasons.length);
    expect(messages.every((message) => message !== "")).toBe(true);
  });
});

describe("display", () => {
  it("explains every reason the system pauses a campaign, with what to do", () => {
    for (const reason of PAUSE_REASONS) {
      expect(PAUSE_EXPLANATION[reason].title).not.toBe("");
      expect(PAUSE_EXPLANATION[reason].advice).toContain("Resume");
    }
  });

  it("reads the recipient filter from the URL, and anything else means everyone", () => {
    for (const status of RECIPIENT_STATUSES) expect(toRecipientStatus(status)).toBe(status);
    expect(toRecipientStatus("all")).toBeNull();
    expect(toRecipientStatus("'; drop table")).toBeNull();
    expect(toRecipientStatus(null)).toBeNull();
  });

  it("adds the five counts up to everyone", () => {
    expect(totalOf({ pending: 1, sent: 2, failed: 3, refused: 4, skipped: 5 })).toBe(15);
  });

  it("pluralises shops", () => {
    expect([shops(0), shops(1), shops(2)]).toEqual(["0 shops", "1 shop", "2 shops"]);
  });
});
