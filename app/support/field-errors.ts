/**
 * Why a new-ticket form field was refused, as a CODE the page turns into translated text.
 *
 * The schema's own messages are English and are never shown: a Zod message that reached a merchant in Spanish would be
 * the one untranslated sentence on the page. The page maps each code with `t()`; this maps a Zod issue to the code.
 */
export const TICKET_FIELDS = ["category", "subject", "body", "merchantEmail", "ccEmails"] as const;
export type TicketField = (typeof TICKET_FIELDS)[number];

export const FIELD_ERROR_CODES = [
  "required",
  "too_long",
  "invalid_email",
  "invalid_choice",
  "invalid_cc_email",
  "too_many_cc_emails",
  "invalid",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

export type FieldErrors = Readonly<Partial<Record<TicketField, FieldErrorCode>>>;

/** The parts of a Zod issue this reads; kept structural so the mapping is testable without building a ZodError. */
export type FormIssue = { readonly path: readonly PropertyKey[]; readonly code: string };

function isTicketField(key: PropertyKey | undefined): key is TicketField {
  return TICKET_FIELDS.some((field) => field === key);
}

function codeFor(field: TicketField, issue: FormIssue): FieldErrorCode {
  switch (field) {
    case "category":
      return "invalid_choice";
    case "subject":
    case "body":
      return issue.code === "too_big" ? "too_long" : issue.code === "too_small" || issue.code === "invalid_type" ? "required" : "invalid";
    case "merchantEmail":
      return "invalid_email";
    case "ccEmails":
      return issue.code === "too_big" ? "too_many_cc_emails" : "invalid_cc_email";
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

/** The first problem per field, in the order the form shows them. Issues about fields the form does not show are ignored. */
export function fieldErrorsOf(issues: readonly FormIssue[]): FieldErrors {
  const found: Partial<Record<TicketField, FieldErrorCode>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (isTicketField(field) && found[field] === undefined) found[field] = codeFor(field, issue);
  }
  return found;
}
