/**
 * An announcement sent to many merchants at once ("campaign" in the code, "announcement" on screen). PURE: no I/O,
 * no clock, safe to import from the browser. What a campaign says and how its life runs live here; who receives it
 * is `campaign-audience.ts` and how it is delivered is `campaign-delivery.ts`.
 */

export const CAMPAIGN_STATUSES = ["draft", "sending", "paused", "sent", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * The lifecycle as DATA, with one funnel (`canTransition`) that every status change goes through. `sent` and
 * `cancelled` are final: a sent announcement cannot be taken back, and a cancelled one cannot be revived (copy it).
 */
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["sending", "cancelled"],
  sending: ["paused", "sent", "cancelled"],
  paused: ["sending", "cancelled"],
  sent: [],
  cancelled: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** A stored status the code no longer knows is not a status: a real guard, since the value came from a column. */
export function isCampaignStatus(value: string): value is CampaignStatus {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_TRANSITIONS, value);
}

/** Only a draft can be edited or deleted: once recipients are fixed, the words that went to them must not change. */
export function isEditable(status: CampaignStatus): boolean {
  return status === "draft";
}

/** Can the announcement still reach someone? A final one cannot. */
export function isLive(status: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[status].length > 0;
}

export const CONTENT_LIMITS = {
  name: 100,
  subject: 150,
  body: 5000,
  ctaLabel: 40,
  ctaUrl: 2000,
} as const;

export interface CampaignContent {
  /** For the team's own list; merchants never see it. */
  readonly name: string;
  readonly subject: string;
  /** Plain text. A blank line starts a new paragraph. No markup: what is written is what is sent. */
  readonly body: string;
  /** A button under the text. Both or neither. */
  readonly ctaLabel: string | null;
  readonly ctaUrl: string | null;
}

export type ContentField = keyof CampaignContent;
export type ContentFault = "required" | "tooLong" | "invalidUrl" | "buttonIncomplete";
export interface ContentError {
  readonly field: ContentField;
  readonly fault: ContentFault;
}

/** Either the cleaned content, or every problem found. */
export type ContentCheck =
  | { readonly ok: true; readonly value: CampaignContent }
  | { readonly ok: false; readonly errors: readonly ContentError[] };

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Check what a person typed and return it trimmed, or EVERY problem at once so a form can mark each field in one
 * round trip. The button link must be https: it goes into a message many people will click, and `javascript:` or a
 * plain-http link has no business there.
 */
export function validateContent(input: {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
}): ContentCheck {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const ctaLabel = input.ctaLabel.trim();
  const ctaUrl = input.ctaUrl.trim();

  const errors: ContentError[] = [];
  const required = (field: ContentField, value: string, max: number) => {
    if (value === "") errors.push({ field, fault: "required" });
    else if (value.length > max) errors.push({ field, fault: "tooLong" });
  };
  required("name", name, CONTENT_LIMITS.name);
  required("subject", subject, CONTENT_LIMITS.subject);
  required("body", body, CONTENT_LIMITS.body);

  if (ctaLabel.length > CONTENT_LIMITS.ctaLabel) errors.push({ field: "ctaLabel", fault: "tooLong" });
  if (ctaUrl.length > CONTENT_LIMITS.ctaUrl) errors.push({ field: "ctaUrl", fault: "tooLong" });
  if ((ctaLabel === "") !== (ctaUrl === "")) {
    errors.push({ field: ctaLabel === "" ? "ctaLabel" : "ctaUrl", fault: "buttonIncomplete" });
  } else if (ctaUrl !== "" && ctaUrl.length <= CONTENT_LIMITS.ctaUrl && !isHttpsUrl(ctaUrl)) {
    errors.push({ field: "ctaUrl", fault: "invalidUrl" });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, subject, body, ctaLabel: ctaLabel === "" ? null : ctaLabel, ctaUrl: ctaUrl === "" ? null : ctaUrl } };
}

/** The body as paragraphs: a blank line splits, and empty pieces are dropped. */
export function paragraphsOf(body: string): readonly string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}
