import { z } from "zod";
import { CONTENT_LIMITS, type ContentError, type ContentFault } from "~/domain/campaign";
import { AUDIENCE_KINDS, DEFAULT_AUDIENCE, describeAudience, type AudienceFilter, type AudiencePreview } from "~/domain/campaign-audience";
import type { Campaign } from "~/ports/campaigns";
import { dayToInstant, instantToDay } from "~/schemas/campaign";

/**
 * How a campaign tool talks to a model: plain structured objects, with a short `next` that says what a careful agent
 * does now. Nothing here reads or writes anything; the tools call it with what a use case returned.
 */

export const AUDIENCE_INPUT = z
  .object({
    kind: z.enum(AUDIENCE_KINDS).optional().describe("'real' (default): real stores only; 'dev': development stores only; 'all': both"),
    installedAfter: z.string().optional().describe("Only stores installed on or after this day, YYYY-MM-DD (UTC). Leave out for no lower bound"),
    installedBefore: z.string().optional().describe("Only stores installed before this day, YYYY-MM-DD (UTC). Leave out for no upper bound"),
  })
  .describe("Who receives it. Only shops that still have the app installed, have an address and have not unsubscribed are ever mailed.");

export type AudienceInput = z.infer<typeof AUDIENCE_INPUT>;

export interface InputFault {
  readonly field: string;
  readonly fault: string;
  readonly message: string;
}

export type Faulty = { readonly ok: false; readonly reason: "invalid"; readonly errors: readonly InputFault[]; readonly next: string };

const FAULT_MESSAGE: Readonly<Record<ContentFault, (field: string) => string>> = {
  required: (field) => `${field} is required and cannot be blank.`,
  tooLong: (field) => `${field} is too long (limits: ${JSON.stringify(CONTENT_LIMITS)}).`,
  invalidUrl: (field) => `${field} must be a full https:// link.`,
  buttonIncomplete: (field) => `${field} is missing: a button needs both ctaLabel and ctaUrl, or neither.`,
};

/** Content faults from the domain, as one entry per field with a sentence a model can act on. */
export function contentFaults(errors: readonly ContentError[]): Faulty {
  return {
    ok: false,
    reason: "invalid",
    errors: errors.map((error) => ({ field: error.field, fault: error.fault, message: FAULT_MESSAGE[error.fault](error.field) })),
    next: "Nothing was saved. Fix the fields listed and call the tool again.",
  };
}

function dateField(field: "installedAfter" | "installedBefore", value: string | undefined): { instant: number | null; fault?: InputFault } {
  if (value === undefined || value.trim() === "") return { instant: null };
  const instant = dayToInstant(value);
  if (instant === null) {
    return { instant: null, fault: { field: `audience.${field}`, fault: "invalidDate", message: `audience.${field} must be a real day written YYYY-MM-DD.` } };
  }
  return { instant };
}

/** The tool's audience as the domain filter, or the faults. No audience means the default: real stores. */
export function audienceFilterFrom(input: AudienceInput | undefined): { ok: true; filter: AudienceFilter } | Faulty {
  if (input === undefined) return { ok: true, filter: DEFAULT_AUDIENCE };
  const after = dateField("installedAfter", input.installedAfter);
  const before = dateField("installedBefore", input.installedBefore);
  const errors = [after.fault, before.fault].flatMap((fault) => (fault === undefined ? [] : [fault]));
  if (errors.length > 0) return { ok: false, reason: "invalid", errors, next: "Nothing was saved. Fix the dates listed and call the tool again." };
  return { ok: true, filter: { kind: input.kind ?? DEFAULT_AUDIENCE.kind, installedAfter: after.instant, installedBefore: before.instant } };
}

/** The filter as a model would write it back to the tool, days not instants. */
export function audienceView(filter: AudienceFilter) {
  return {
    sentences: describeAudience(filter),
    filter: { kind: filter.kind, installedAfter: instantToDay(filter.installedAfter) || null, installedBefore: instantToDay(filter.installedBefore) || null },
  };
}

export function previewView(preview: AudiencePreview) {
  return {
    matched: preview.matched,
    withoutAddress: preview.withoutAddress,
    unsubscribed: preview.unsubscribed,
    recipients: preview.recipients,
    sample: preview.sample,
  };
}

/** The words of a campaign, whole: a human is going to be shown exactly this. */
export function campaignView(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    subject: campaign.subject,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
  };
}

export const NOT_FOUND = (id: string) => ({ ok: false as const, reason: "not_found" as const, message: `No campaign '${id}'.`, next: "Use list_campaigns to find the id." });

export const NOT_DRAFT = (id: string) => ({
  ok: false as const,
  reason: "not_draft" as const,
  message: `Campaign '${id}' is no longer a draft, so its words and audience are fixed.`,
  next: "To change what merchants get, create a new campaign. A started one can only be paused, resumed or cancelled.",
});
