import type { ContentError, ContentField, ContentFault } from "~/domain/campaign";
import { CONTENT_LIMITS } from "~/domain/campaign";
import { formatNumber } from "~/i18n/format";
import type { AudiencePreview } from "~/domain/campaign-audience";
import type { StartOutcome } from "~/services/campaigns.server";

/**
 * What a form submission answers, and the words for every outcome. PURE and browser-safe: the intent handlers build
 * these, the page reads them, and a test can check every sentence without a database.
 */

export type FieldErrors = Partial<Record<ContentField, ContentFault>>;

export type CampaignActionResult =
  | { readonly kind: "done"; readonly message: string }
  | { readonly kind: "preview"; readonly preview: AudiencePreview }
  | { readonly kind: "failed"; readonly message: string; readonly fields: FieldErrors };

/** What a handler hands back: an answer for the page, or a place to go. */
export type HandlerOutcome = { readonly result: CampaignActionResult } | { readonly redirectTo: string };

export function done(message: string): HandlerOutcome {
  return { result: { kind: "done", message } };
}

export function failed(message: string, fields: FieldErrors = {}): HandlerOutcome {
  return { result: { kind: "failed", message, fields } };
}

export const UNREADABLE = "The form could not be read. Reload the page and try again.";
export const NOT_FOUND = "This announcement no longer exists.";
export const NOT_A_DRAFT = "It has already started or finished, so it can no longer be changed.";

/** The first fault per field, keyed by field, so a form can mark each one. */
export function fieldErrorsOf(errors: readonly ContentError[]): FieldErrors {
  const fields: Record<string, ContentFault> = {};
  for (const error of errors) if (!(error.field in fields)) fields[error.field] = error.fault;
  return fields;
}

const FIELD_NAME: Readonly<Record<ContentField, string>> = {
  name: "Name",
  subject: "Subject",
  body: "Message",
  ctaLabel: "Button label",
  ctaUrl: "Button link",
};

/** The words under a field that has a fault. */
export function faultText(field: ContentField, fault: ContentFault): string {
  switch (fault) {
    case "required":
      return `${FIELD_NAME[field]} is required.`;
    case "tooLong":
      return `${FIELD_NAME[field]} is too long (at most ${formatNumber("en", CONTENT_LIMITS[field])} characters).`;
    case "invalidUrl":
      return "The link must be a full address starting with https://";
    case "buttonIncomplete":
      return "A button needs both a label and a link. Fill in both, or leave both empty.";
  }
}

export function invalidDraft(errors: readonly ContentError[]): HandlerOutcome {
  return failed("Some fields need fixing before this can be saved.", fieldErrorsOf(errors));
}

export function startResult(outcome: StartOutcome, shown: number): HandlerOutcome {
  if (outcome.ok) return done(`Sending to ${shops(outcome.recipients)}. You can follow it here.`);
  switch (outcome.reason) {
    case "not_found":
      return failed(NOT_FOUND);
    case "not_draft":
      return failed("This announcement was already sent or cancelled. Nothing new was sent.");
    case "no_recipients":
      return failed("Nobody would receive this. Choose a wider audience, then review it again.");
    case "changed":
      return failed("The draft was edited while you were reviewing it. Nothing was sent: read it again and send.");
    case "audience_changed":
      return failed(`The audience changed while you were reviewing: it now reaches ${shops(outcome.recipients)}, not the ${shown} you were shown. Nothing was sent. Check the number and send again.`);
  }
}

export function shops(count: number): string {
  return `${formatNumber("en", count)} ${count === 1 ? "shop" : "shops"}`;
}

export const NOT_ALLOWED_NOW = "That is not possible in the current state. Someone else may have changed it: reload the page.";
