import { describe, expect, it } from "vitest";
import { BODY_MAX, SUBJECT_MAX } from "~/schemas/support";
import { CONTACT_NAME_MAX, parseContactForm } from "./support-contact";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Ada", email: "ada@buyer.example", subject: "Hi", message: "Hello", shop: "", ...fields })) {
    data.set(key, value);
  }
  return data;
}

describe("parseContactForm", () => {
  it("accepts a message and trims, lower-cases the shop, and treats a blank shop as none", () => {
    const parsed = parseContactForm(form({ name: "  Ada  ", shop: " Alpha.MyShopify.com " }));
    expect(parsed).toEqual({
      kind: "valid",
      input: { name: "Ada", email: "ada@buyer.example", subject: "Hi", message: "Hello", shop: "alpha.myshopify.com" },
    });
    expect(parseContactForm(form({ shop: "" }))).toMatchObject({ input: { shop: null } });
  });

  it("names the reason per field and keeps what was typed", () => {
    const parsed = parseContactForm(
      form({ name: " ", email: "not-an-email", subject: "x".repeat(SUBJECT_MAX + 1), message: "y".repeat(BODY_MAX + 1), shop: "evil.example.com" }),
    );
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind !== "invalid") return;
    expect(parsed.errors).toEqual({ name: "required", email: "email", subject: "too_long", message: "too_long", shop: "shop" });
    expect(parsed.values.email).toBe("not-an-email");
  });

  it("refuses a name past its cap and a missing field", () => {
    expect(parseContactForm(form({ name: "n".repeat(CONTACT_NAME_MAX + 1) }))).toMatchObject({ errors: { name: "too_long" } });
    const missing = new FormData();
    expect(parseContactForm(missing)).toMatchObject({ kind: "invalid", errors: { name: "required", email: "required", subject: "required", message: "required" } });
  });

  it("recognises a filled decoy field before anything else", () => {
    expect(parseContactForm(form({ website: "https://spam.example", email: "broken" }))).toEqual({ kind: "trap" });
    expect(parseContactForm(form({ website: "   " })).kind).toBe("valid");
  });
});
