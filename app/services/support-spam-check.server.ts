import { spamTriageTask } from "~/ai/tasks/spam-triage";
import type { AiFailureReason } from "~/ports/ai";
import type { AiService } from "~/services/ai.server";
import type { TriageCandidate } from "~/support/triage/types";

export interface SpamCheckDependencies {
  readonly ai: Pick<AiService, "runDecision">;
  /** Where a degraded check reports itself: a stable event and the reason, never the mail or an address. */
  readonly log: (entry: { readonly event: "support.spam_check_unavailable"; readonly reason: AiFailureReason }) => void;
}

/**
 * Ask the model how likely a mail is to be spam: a probability from 0 to 1.
 *
 * `null` means "no answer": no model is configured, the call timed out, a cap or gate refused it. The caller treats
 * that as "open the conversation" (@rules/ai.md: AI is decoration, never correctness), and the reason is logged so a
 * check that is silently off is visible.
 *
 * Runs as `system`: nobody is waiting on it and no merchant is charged.
 */
export async function scoreSpam(dependencies: SpamCheckDependencies, candidate: TriageCandidate): Promise<number | null> {
  const result = await dependencies.ai.runDecision(spamTriageTask, candidate, { surface: "system", shop: null });
  if (result.ok) return result.value;
  dependencies.log({ event: "support.spam_check_unavailable", reason: result.reason });
  return null;
}
