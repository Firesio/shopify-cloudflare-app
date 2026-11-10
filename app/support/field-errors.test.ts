import { describe, expect, it } from "vitest";
import { createTicketSchema } from "~/schemas/support";
import { fieldErrorsOf } from "./field-errors";

const valid = { category: "bug", subject: "Broken", body: "It is broken", merchantEmail: "owner@alpha.test", ccEmails: "", uploadIds: "" };

function errorsFor(over: Record<string, string>) {
  const parsed = createTicketSchema.safeParse({ ...valid, ...over });
  if (parsed.success) throw new Error("expected the form to be refused");
  return fieldErrorsOf(parsed.error.issues);
}

describe("fieldErrorsOf, against the real schema", () => {
  it("asks for a subject and a body that are blank once trimmed", () => {
    expect(errorsFor({ subject: "   ", body: "" })).toEqual({ subject: "required", body: "required" });
  });

  it("says a subject or body is too long", () => {
    expect(errorsFor({ subject: "x".repeat(201) })).toEqual({ subject: "too_long" });
    expect(errorsFor({ body: "x".repeat(5001) })).toEqual({ body: "too_long" });
  });

  it("flags a reply address that is not an email", () => {
    expect(errorsFor({ merchantEmail: "not-an-email" })).toEqual({ merchantEmail: "invalid_email" });
  });

  it("flags a category that is not one of the options", () => {
    expect(errorsFor({ category: "spam" })).toEqual({ category: "invalid_choice" });
  });

  it("tells a bad copied address from a list that is too long", () => {
    expect(errorsFor({ ccEmails: "a@alpha.test,nope" })).toEqual({ ccEmails: "invalid_cc_email" });
    expect(errorsFor({ ccEmails: "a@x.test,b@x.test,c@x.test,d@x.test,e@x.test,f@x.test" })).toEqual({ ccEmails: "too_many_cc_emails" });
  });

  it("reports the first problem per field only, and never the schema's English", () => {
    const errors = errorsFor({ subject: "", body: "", merchantEmail: "x" });
    expect(Object.values(errors)).toEqual(["required", "required", "invalid_email"]);
    expect(JSON.stringify(errors)).not.toMatch(/valid email|Invalid input|too small/i);
  });
});

describe("fieldErrorsOf, on bare issues", () => {
  it("ignores fields the form does not show", () => {
    expect(fieldErrorsOf([{ path: ["uploadIds"], code: "invalid_type" }, { path: [], code: "custom" }])).toEqual({});
  });

  it("falls back to a generic code for a rule it does not know", () => {
    expect(fieldErrorsOf([{ path: ["subject"], code: "custom" }])).toEqual({ subject: "invalid" });
  });
});
