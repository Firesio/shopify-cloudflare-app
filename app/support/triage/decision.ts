import type { SpamReason, SpamVerdict, TriageDecision } from "./types";

export const OPEN_CONVERSATION: TriageDecision = { action: "open" };

export function quarantineFor(reason: SpamReason): TriageDecision {
  return { action: "quarantine", reason };
}

/**
 * What the model's answer means for a mail.
 *
 * Only a confident `spam` holds a mail back. `unsure`, `legit` and NO answer (a missing model, a timeout,
 * a refused call) all open the conversation: a real customer's mail must never be lost because a model
 * was down or doubtful. A wrongly held mail is recoverable from the quarantine; a wrongly dropped one is not.
 */
export function decisionForVerdict(verdict: SpamVerdict | null): TriageDecision {
  return verdict === "spam" ? quarantineFor("ai_spam") : OPEN_CONVERSATION;
}
