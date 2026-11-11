import type { SupportSource } from "~/support/inbound/types";

/** Why a mail was held back. A closed list, shared by the column, the console and the log. */
export const SPAM_REASONS = ["blocked_sender", "flood", "ai_spam"] as const;
export type SpamReason = (typeof SPAM_REASONS)[number];

/** What a triage decision is made from: the mail as a source reduced it, and nothing else. */
export interface TriageCandidate {
  readonly source: SupportSource;
  readonly senderEmail: string;
  readonly subject: string;
  readonly body: string;
}

/** Open a conversation as usual, or hold the mail for a person to look at. */
export type TriageDecision =
  | { readonly action: "open" }
  | { readonly action: "quarantine"; readonly reason: SpamReason };
