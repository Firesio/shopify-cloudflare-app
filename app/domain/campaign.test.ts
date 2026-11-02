import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  CONTENT_LIMITS,
  canTransition,
  isCampaignStatus,
  isEditable,
  isLive,
  paragraphsOf,
  validateContent,
} from "./campaign";

const valid = { name: "Big update", subject: "A big update is coming", body: "Next week we ship it.", ctaLabel: "", ctaUrl: "" };

describe("the lifecycle", () => {
  it("declares a move out of every status, or none for a final one", () => {
    for (const status of CAMPAIGN_STATUSES) {
      for (const target of CAMPAIGN_TRANSITIONS[status]) expect(CAMPAIGN_STATUSES).toContain(target);
    }
  });

  it("makes sent and cancelled final: nothing leaves them", () => {
    for (const final of ["sent", "cancelled"] as const) {
      for (const target of CAMPAIGN_STATUSES) expect(canTransition(final, target)).toBe(false);
      expect(isLive(final)).toBe(false);
    }
  });

  it.each([
    ["draft", "sending", true],
    ["draft", "sent", false],
    ["draft", "paused", false],
    ["sending", "paused", true],
    ["sending", "sent", true],
    ["paused", "sending", true],
    ["paused", "sent", false],
    ["sending", "draft", false],
  ] as const)("%s to %s is %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it("can be cancelled from every live status", () => {
    for (const status of CAMPAIGN_STATUSES.filter(isLive)) expect(canTransition(status, "cancelled")).toBe(true);
  });

  it("allows editing a draft and nothing else", () => {
    expect(CAMPAIGN_STATUSES.filter(isEditable)).toEqual(["draft"]);
  });

  it("recognises exactly the declared statuses", () => {
    for (const status of CAMPAIGN_STATUSES) expect(isCampaignStatus(status)).toBe(true);
    for (const value of ["", "Draft", "done", "__proto__", "toString"]) expect(isCampaignStatus(value)).toBe(false);
  });
});

describe("validateContent", () => {
  it("returns the trimmed content, with an absent button as null", () => {
    const checked = validateContent({ name: "  Big update ", subject: " Hi ", body: "  Text  ", ctaLabel: " ", ctaUrl: "" });
    expect(checked).toEqual({ ok: true, value: { name: "Big update", subject: "Hi", body: "Text", ctaLabel: null, ctaUrl: null } });
  });

  it("accepts a complete button with an https link", () => {
    const checked = validateContent({ ...valid, ctaLabel: "Read more", ctaUrl: "https://example.org/news" });
    expect(checked).toMatchObject({ ok: true, value: { ctaLabel: "Read more", ctaUrl: "https://example.org/news" } });
  });

  it("reports every missing field at once", () => {
    const checked = validateContent({ name: " ", subject: "", body: "\n", ctaLabel: "", ctaUrl: "" });
    expect(checked).toEqual({
      ok: false,
      errors: [
        { field: "name", fault: "required" },
        { field: "subject", fault: "required" },
        { field: "body", fault: "required" },
      ],
    });
  });

  it("refuses a field over its limit, and accepts one exactly at it", () => {
    expect(validateContent({ ...valid, subject: "x".repeat(CONTENT_LIMITS.subject) }).ok).toBe(true);
    expect(validateContent({ ...valid, subject: "x".repeat(CONTENT_LIMITS.subject + 1) })).toEqual({
      ok: false,
      errors: [{ field: "subject", fault: "tooLong" }],
    });
  });

  it("refuses a button with only half of it", () => {
    expect(validateContent({ ...valid, ctaLabel: "Read more" })).toEqual({ ok: false, errors: [{ field: "ctaUrl", fault: "buttonIncomplete" }] });
    expect(validateContent({ ...valid, ctaUrl: "https://example.org" })).toEqual({ ok: false, errors: [{ field: "ctaLabel", fault: "buttonIncomplete" }] });
  });

  it.each(["http://example.org", "javascript:alert(1)", "ftp://example.org", "example.org", "//example.org", "data:text/html,x"])(
    "refuses the button link %s: only https",
    (ctaUrl) => {
      expect(validateContent({ ...valid, ctaLabel: "Go", ctaUrl })).toEqual({ ok: false, errors: [{ field: "ctaUrl", fault: "invalidUrl" }] });
    },
  );
});

describe("paragraphsOf", () => {
  it("splits on blank lines and drops empty pieces", () => {
    expect(paragraphsOf("One\n\nTwo\n\n\n\n Three \n")).toEqual(["One", "Two", "Three"]);
  });

  it("keeps a single line break inside a paragraph", () => {
    expect(paragraphsOf("a\nb")).toEqual(["a\nb"]);
  });
});
