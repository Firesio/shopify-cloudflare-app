import { z } from "zod";
import { BODY_MAX, SUBJECT_MAX } from "~/schemas/support";

export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 254;
/** The hidden field a person never fills in; a bot that fills every field does. */
export const CONTACT_TRAP_FIELD = "website";

export const CONTACT_FIELDS = ["name", "email", "subject", "message", "shop"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Why one field was refused. Closed, because each one is a translated message. */
export type ContactFieldError = "required" | "too_long" | "email" | "shop";

const ERRORS: Record<ContactFieldError, true> = { required: true, too_long: true, email: true, shop: true };

function toFieldError(message: string): ContactFieldError {
  return Object.keys(ERRORS).find((key): key is ContactFieldError => key === message) ?? "required";
}

const required = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "required").max(max, "too_long"));

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const contactSchema = z.object({
  name: required(CONTACT_NAME_MAX),
  email: required(CONTACT_EMAIL_MAX).pipe(z.string().email("email")),
  subject: required(SUBJECT_MAX),
  message: required(BODY_MAX),
  // Optional: a visitor may not have a shop. Blank is "none", not invalid.
  shop: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().max(100, "shop").refine((value) => value === "" || SHOP_DOMAIN.test(value), "shop"))
    .transform((value) => (value === "" ? null : value)),
});

export interface ContactInput {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly shop: string | null;
}

export type ContactValues = Readonly<Record<ContactField, string>>;

export type ParsedContact =
  | { readonly kind: "trap" }
  | { readonly kind: "valid"; readonly input: ContactInput }
  | {
      readonly kind: "invalid";
      readonly errors: Readonly<Partial<Record<ContactField, ContactFieldError>>>;
      /** What was typed, so the form is not emptied on a mistake. */
      readonly values: ContactValues;
    };

function read(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

/** Parse at the edge: a filled trap, a valid message, or per-field reasons. */
export function parseContactForm(form: FormData): ParsedContact {
  if (read(form, CONTACT_TRAP_FIELD).trim() !== "") return { kind: "trap" };

  const values: ContactValues = {
    name: read(form, "name"),
    email: read(form, "email"),
    subject: read(form, "subject"),
    message: read(form, "message"),
    shop: read(form, "shop"),
  };
  const parsed = contactSchema.safeParse(values);
  if (parsed.success) return { kind: "valid", input: parsed.data };

  const errors: Partial<Record<ContactField, ContactFieldError>> = {};
  for (const issue of parsed.error.issues) {
    const field = CONTACT_FIELDS.find((candidate) => candidate === issue.path[0]);
    if (field !== undefined && errors[field] === undefined) errors[field] = toFieldError(issue.message);
  }
  return { kind: "invalid", errors, values };
}
