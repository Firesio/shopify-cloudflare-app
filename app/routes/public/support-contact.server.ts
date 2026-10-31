import {
  parseContactForm,
  type ContactField,
  type ContactFieldError,
  type ContactValues,
} from "~/schemas/support-contact";
import type { ContactFailure, SupportContactService } from "~/services/support-contact.server";

const TURNSTILE_FIELD = "cf-turnstile-response";

export type ContactActionResult =
  | { readonly kind: "sent" }
  | {
      readonly kind: "refused";
      readonly status: number;
      readonly errors: Readonly<Partial<Record<ContactField, ContactFieldError>>>;
      readonly values: ContactValues;
      readonly failure: ContactFailure | null;
    };

const STATUS: Record<ContactFailure, number> = { rate_limited: 429, bot_check_failed: 400, bot_check_unavailable: 503 };

/**
 * Parse, dispatch, decide what to say. A filled decoy field is answered as a
 * success so a bot learns nothing; the route turns `sent` into a redirect (post,
 * redirect, get), so a refresh cannot send the message twice.
 */
export async function handleContactAction(
  request: Request,
  dependencies: { readonly service: Pick<SupportContactService, "submit"> },
): Promise<ContactActionResult> {
  const form = await request.formData();
  const parsed = parseContactForm(form);
  if (parsed.kind === "trap") return { kind: "sent" };
  if (parsed.kind === "invalid") {
    return { kind: "refused", status: 400, errors: parsed.errors, values: parsed.values, failure: null };
  }

  const token = form.get(TURNSTILE_FIELD);
  const submitted = await dependencies.service.submit(parsed.input, {
    ip: request.headers.get("CF-Connecting-IP"),
    turnstileToken: typeof token === "string" ? token : null,
  });
  if (submitted.ok) return { kind: "sent" };

  return {
    kind: "refused",
    status: STATUS[submitted.reason],
    errors: {},
    values: {
      name: parsed.input.name,
      email: parsed.input.email,
      subject: parsed.input.subject,
      message: parsed.input.message,
      shop: parsed.input.shop ?? "",
    },
    failure: submitted.reason,
  };
}
