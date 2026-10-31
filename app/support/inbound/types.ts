/**
 * Where a support conversation came from. One closed list, shared by the
 * schema, the registries and the staff console, so a source cannot exist in one
 * place and be rejected by another.
 */
export const SUPPORT_SOURCES = [
  "app_portal",
  "shopify_relay",
  "email",
  "web_form",
] as const;

export type SupportSource = (typeof SUPPORT_SOURCES)[number];

/** Narrows stored text to a known source; an unknown value is the retired-variant case. */
export function toSupportSource(value: string): SupportSource | null {
  return SUPPORT_SOURCES.find((source) => source === value) ?? null;
}

export interface MailAddress {
  readonly address: string;
  readonly name: string;
}

/**
 * A received mail, already parsed by the adapter. Everything the decisions need
 * and nothing they do not: no MIME, no streams, no HTML.
 */
export interface ParsedMail {
  /** Null only for a malformed message; such mail is refused, never stored. */
  readonly messageId: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly from: MailAddress;
  readonly replyTo: MailAddress | null;
  /** Every envelope or header recipient, lower-cased by the adapter. */
  readonly recipients: readonly string[];
  readonly subject: string;
  /** The text/plain part. HTML is never read: its links are tracking redirects. */
  readonly text: string;
  readonly autoSubmitted: string | null;
  readonly precedence: string | null;
  /**
   * Domains whose DKIM signature the adapter saw pass. The adapter derives it
   * from `Authentication-Results`; a mail with none has no verified sender.
   */
  readonly dkimPassDomains: readonly string[];
}

/** What every mail source reduces a message to before a thread is chosen. */
export interface NormalizedInbound {
  readonly source: SupportSource;
  /** The dedupe key: the same value arriving twice is one message. */
  readonly externalId: string;
  readonly senderEmail: string;
  readonly senderName: string;
  /** The shop the message names, when the source can say; never trusted blindly. */
  readonly shopHint: string | null;
  readonly shopName: string | null;
  readonly subject: string;
  readonly body: string;
}
