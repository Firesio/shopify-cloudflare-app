import type { NormalizedInbound } from "~/support/inbound/types";
import type { SpamReason, TriageCandidate, TriageDecision } from "~/support/triage/types";

/** A mail held back instead of opening a conversation: the normalised mail, why, and when. */
export interface NewHeldMail extends NormalizedInbound {
  readonly reason: SpamReason;
  readonly createdAt: number;
}

export interface HeldMail extends NewHeldMail {
  readonly id: string;
}

/** Where held mail waits for a person. Not a ticket: no queue, count or alert ever sees it. */
export interface SpamQuarantine {
  /** False when this mail (by its own id) is already held, so a redelivery stores nothing. */
  hold(mail: NewHeldMail): Promise<boolean>;
  find(id: string): Promise<HeldMail | null>;
  /** False when it is already gone. */
  discard(id: string): Promise<boolean>;
}

/** Senders staff chose to refuse, as stored patterns (see `parseSenderPattern`). */
export interface BlockedSenders {
  patterns(): Promise<readonly string[]>;
}

/** Decides what happens to the mail of a stranger before a conversation exists for it. */
export interface InboundTriage {
  assess(candidate: TriageCandidate): Promise<TriageDecision>;
}
