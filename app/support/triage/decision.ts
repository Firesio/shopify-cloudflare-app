import type { SpamReason, TriageDecision } from "./types";

export const OPEN_CONVERSATION: TriageDecision = { action: "open" };

export function quarantineFor(reason: SpamReason): TriageDecision {
  return { action: "quarantine", reason };
}

/**
 * How sure the model must be before a mail is held: a probability of spam of at least this.
 *
 * High on purpose, because the two mistakes are not equal. A held real mail waits for a person, who can release it;
 * a real customer's mail that never reaches us is lost. A mail scoring below this opens a conversation, however
 * spammy it looks. Tried on a handful of mails on 2026-11-11 (Clef: spam 0.99, real customers 0.005 to 0.02; Clef
 * Flash: spam 0.94 to 0.96, real 0.01 to 0.02), so this is a starting point and not a calibration: watch the Spam
 * page, and if real mail turns up held, raise it.
 */
export const SPAM_SCORE_HOLD_AT = 0.9;

/**
 * What the model's score means for a mail.
 *
 * Only a confident score holds a mail back. A lower one and NO answer (a missing model, a timeout, a refused call)
 * both open the conversation: a real customer's mail must never be lost because a model was down or doubtful.
 * A wrongly held mail is recoverable from the quarantine; a wrongly dropped one is not.
 */
export function decisionForSpamScore(score: number | null): TriageDecision {
  return score !== null && score >= SPAM_SCORE_HOLD_AT ? quarantineFor("ai_spam") : OPEN_CONVERSATION;
}
