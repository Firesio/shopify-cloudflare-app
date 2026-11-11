import { spamTriageTask } from "~/ai/tasks/spam-triage";
import type { AiFailureReason } from "~/ports/ai";
import type { AiService } from "~/services/ai.server";
import type { SpamVerdict, TriageCandidate } from "~/support/triage/types";

export interface SpamCheckDependencies {
  readonly ai: Pick<AiService, "runObject">;
  /** Where a degraded check reports itself: a stable event and the reason, never the mail or an address. */
  readonly log: (entry: { readonly event: "support.spam_check_unavailable"; readonly reason: AiFailureReason }) => void;
}

/**
 * Ask the model whether a mail is spam.
 *
 * `null` means "no answer": no model is configured, the call timed out, a cap or gate refused it. The caller treats
 * that as "open the conversation" (@rules/ai.md: AI is decoration, never correctness), and the reason is logged so a
 * check that is silently off is visible.
 *
 * Runs as `system`: nobody is waiting on it and no merchant is charged.
 */
export async function classifySpam(dependencies: SpamCheckDependencies, candidate: TriageCandidate): Promise<SpamVerdict | null> {
  const result = await dependencies.ai.runObject(spamTriageTask, candidate, { surface: "system", shop: null });
  if (result.ok) return result.value.verdict;
  dependencies.log({ event: "support.spam_check_unavailable", reason: result.reason });
  return null;
}
