import type { TriageCandidate } from "~/support/triage/types";
import { SPAM_QUESTION, buildSpamState } from "../spam-prompt";
import { defineAiDecisionTask } from "../task";

/**
 * How likely a mail is spam, as a probability. The `decision` purpose exists for exactly this: a yes/no question
 * about some content, scored by a decision model instead of answered in text.
 */
export const spamTriageTask = defineAiDecisionTask<TriageCandidate>({
  feature: "support.spam_triage",
  role: "decision",
  question: SPAM_QUESTION,
  state: buildSpamState,
});
