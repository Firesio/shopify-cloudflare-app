import { fieldErrorsOf, type FieldErrors } from "~/support/field-errors";
import { createTicketSchema } from "~/schemas/support";
import { supportService } from "~/wiring.server";
import { shopNameFor, type AdminGraphql } from "./shop-contact.server";

export type CreateTicketOutcome =
  | { readonly kind: "invalid"; readonly fieldErrors: FieldErrors }
  | { readonly kind: "refused"; readonly error: "rate_limited" | "invalid_upload" }
  | { readonly kind: "created"; readonly id: string };

/**
 * File the ticket the new-ticket form describes.
 *
 * One call into the service: the ticket, its first message and the files it adopts are written as ONE unit, and the form's
 * submission key makes a repeated send (a double click, a retry after a lost response) the same ticket, never a second.
 * Every upload id is checked before anything is written.
 */
export async function createTicket(input: {
  readonly shop: string;
  readonly form: FormData;
  /** The language the form was drawn in, stored on the ticket because staff answer from a console that knows nothing of the merchant. */
  readonly language: string;
  readonly graphql: AdminGraphql;
}): Promise<CreateTicketOutcome> {
  const parsed = createTicketSchema.safeParse(Object.fromEntries(input.form));
  if (!parsed.success) return { kind: "invalid", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  // The shop name is a snapshot on the ticket, so it is read here rather than trusted from the form — a hidden field is
  // merchant-editable.
  const shopName = await shopNameFor(input.graphql, input.shop);

  const created = await supportService().openTicket({
    shop: input.shop,
    shopName,
    locale: input.language,
    merchantEmail: parsed.data.merchantEmail,
    ccEmails: parsed.data.ccEmails,
    category: parsed.data.category,
    subject: parsed.data.subject,
    body: parsed.data.body,
    submissionKey: parsed.data.submissionKey,
    uploadIds: parsed.data.uploadIds,
  });
  if (!created.ok) return { kind: "refused", error: created.reason };
  return { kind: "created", id: created.value.id };
}
