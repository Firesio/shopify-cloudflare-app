import { describe, expect, it } from "vitest";
import { isBlockedSender, parseSenderPattern } from "./sender-pattern";

describe("parsing what staff typed", () => {
  it.each([
    ["Seo@Spam.Example", "seo@spam.example"],
    ["  spam.example  ", "spam.example"],
    ["@spam.example", "spam.example"],
    ["mail.spam.co.uk", "mail.spam.co.uk"],
  ])("stores %j as %j", (input, stored) => {
    expect(parseSenderPattern(input)).toEqual({ ok: true, value: stored });
  });

  it.each(["", "   ", "com", "@", "a b@spam.example", "spam", "seo@", "@@spam.example", "https://spam.example", `${"a".repeat(250)}.example`])(
    "refuses %j",
    (input) => {
      expect(parseSenderPattern(input)).toEqual({ ok: false, reason: "invalid" });
    },
  );
});

describe("whether a sender is blocked", () => {
  it("matches a full address exactly, and only that mailbox", () => {
    expect(isBlockedSender(["seo@spam.example"], "seo@spam.example")).toBe(true);
    expect(isBlockedSender(["seo@spam.example"], "jane@spam.example")).toBe(false);
  });

  it("matches a domain and every subdomain of it", () => {
    expect(isBlockedSender(["spam.example"], "anyone@spam.example")).toBe(true);
    expect(isBlockedSender(["spam.example"], "anyone@mail.spam.example")).toBe(true);
  });

  it("does not match a different domain that merely ends the same way", () => {
    // `notspam.example` is not a subdomain of `spam.example`.
    expect(isBlockedSender(["spam.example"], "anyone@notspam.example")).toBe(false);
  });

  it("ignores case and surrounding space in the sender", () => {
    expect(isBlockedSender(["spam.example"], "  Seo@SPAM.example ")).toBe(true);
  });

  it("blocks nothing when nothing is blocked", () => {
    expect(isBlockedSender([], "seo@spam.example")).toBe(false);
  });
});
