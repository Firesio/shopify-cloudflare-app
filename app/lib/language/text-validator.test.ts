import { describe, expect, it } from "vitest";
import { validateText, type TextSpec } from "./text-validator";

const SPEC: TextSpec = { allowed: ["name", "ticketNumber"], maxLength: 80 };
function reason(text: string, extra: Partial<TextSpec> = {}): string {
  const verdict = validateText(text, { ...SPEC, ...extra });
  return verdict.ok ? "ok" : verdict.reason;
}

describe("validateText", () => {
  it("accepts plain text and allowed placeholders", () => {
    expect(reason("Hello {{name}}, ticket {{ ticketNumber }} is ready")).toBe("ok");
  });

  it("rejects the i18next syntax that is not plain placeholders", () => {
    expect(reason("Hi {{- name}}")).toBe("unescaped_placeholder");
    expect(reason("Hi $t(email:support.reply.cta)")).toBe("nesting");
    expect(reason("Hi {{name, uppercase}}")).toBe("formatted_placeholder");
    expect(reason("Hi {{name, number}}")).toBe("formatted_placeholder");
    expect(reason("Hi {{secret}}")).toBe("unknown_placeholder");
    expect(reason("Hi {{name")).toBe("malformed_placeholder");
    expect(reason("Hi {{ na me }}")).toBe("malformed_placeholder");
    expect(reason("Hi }} there")).toBe("malformed_placeholder");
  });

  // D1: a placeholder named like an i18next option is refused (`count` only in a plural form).
  it("rejects placeholder names that are i18next option names", () => {
    for (const name of ["lng", "ns", "context", "replace", "defaultValue", "returnObjects", "postProcess", "interpolation"]) {
      expect(reason(`Hi {{${name}}}`, { allowed: [name] }), name).toBe("reserved_placeholder");
    }
    expect(reason("{{count}} items", { allowed: ["count"] })).toBe("reserved_placeholder");
    expect(reason("{{count}} items", { allowed: ["count"], plural: true })).toBe("ok");
    expect(reason("{{lng}} items", { allowed: ["lng"], plural: true })).toBe("reserved_placeholder");
  });

  it("rejects control characters, line breaks on a single line, emptiness and length", () => {
    expect(reason("a\u0000b")).toBe("control_character");
    expect(reason("a\u0001b")).toBe("control_character");
    expect(reason("a\nb")).toBe("control_character");
    expect(reason("a\nb", { multiline: true })).toBe("ok");
    expect(reason("   ")).toBe("empty");
    expect(reason("x".repeat(81))).toBe("too_long");
    expect(reason("😀".repeat(80))).toBe("ok");
  });

  it("rejects characters that hide or reorder text: C1 controls, format characters, line and paragraph separators", () => {
    expect(reason("a\u0085b", { multiline: true })).toBe("control_character"); // C1 NEL
    expect(reason("a\u007Fb")).toBe("control_character"); // DEL
    expect(reason("a​b")).toBe("control_character"); // zero width space
    expect(reason("a‮b")).toBe("control_character"); // right-to-left override
    expect(reason("﻿a")).toBe("control_character"); // BOM
    expect(reason("a b", { multiline: true })).toBe("control_character"); // line separator
    expect(reason("a b", { multiline: true })).toBe("control_character"); // paragraph separator
    expect(reason("a\uD800b")).toBe("control_character"); // lone surrogate
  });

  it("keeps the joiners that Persian, Hindi and emoji need", () => {
    expect(reason("می‌خواهم")).toBe("ok"); // ZWNJ
    expect(reason("👨‍👩‍👧")).toBe("ok"); // ZWJ sequence
  });

  it("rejects a URL the source did not have, with or without a scheme", () => {
    expect(reason("see https://evil.example/x")).toBe("new_url");
    expect(reason("see www.evil.example")).toBe("new_url");
    expect(reason("pay at evil.com/pay")).toBe("new_url");
    expect(reason("pay at evil.com")).toBe("new_url");
    expect(reason("pay at EVIL.COM:8080/x?y=1")).toBe("new_url");
    expect(reason("ouvrez exemple.fr/pay")).toBe("new_url");
  });

  it("does not take ordinary text for a link", () => {
    for (const text of ["Version 3.5 is out", "e.g. this", "i.e. that", "Ready at 10.30 today", "Costs 4.99.", "wait... what"]) expect(reason(text), text).toBe("ok");
  });

  it("allows the addresses the source already had, however they are spelled", () => {
    expect(reason("see https://ok.example/a", { sourceText: "go to HTTPS://OK.example/a" })).toBe("ok");
    expect(reason("see ok.example/a", { sourceText: "go to https://ok.example/a" })).toBe("ok");
    expect(reason("see www.ok.example", { sourceText: "go to ok.example" })).toBe("ok");
  });

  it("is not fooled by the punctuation a sentence puts after a link", () => {
    expect(reason("Visit https://shop.com.", { sourceText: "Visit https://shop.com" })).toBe("ok");
    expect(reason("(see https://shop.com/help), then reply", { sourceText: "https://shop.com/help" })).toBe("ok");
    expect(reason("Visit https://shop.com!", { sourceText: "Visit shop.com/" })).toBe("ok");
    expect(reason("Visit https://evil.com.", { sourceText: "Visit https://shop.com" })).toBe("new_url");
  });

  it("does not look inside placeholders for links", () => {
    expect(reason("Hi {{name}}.")).toBe("ok");
  });
});
