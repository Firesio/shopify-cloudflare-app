import type { BlockedSenders, InboundTriage } from "~/ports/support-triage";
import { decisionForSpamScore, quarantineFor } from "~/support/triage/decision";
import { isBlockedSender } from "~/support/triage/sender-pattern";
import type { TriageCandidate, TriageDecision } from "~/support/triage/types";

export interface SupportTriageDependencies {
  readonly blocked: BlockedSenders;
  /** True while the sender is within their allowance. Absent limiter: always true (fails open). */
  readonly withinRateLimit: (senderEmail: string) => Promise<boolean>;
  /** The probability the mail is spam, or null when there is no answer. */
  readonly scoreSpam: (candidate: TriageCandidate) => Promise<number | null>;
}

/**
 * What happens to the first mail of a stranger. Cheapest refusal first, like the public form: the blocklist is one
 * small read, the limiter one binding call, and the model, which costs money, only ever sees mail that passed both.
 */
export class SupportTriageService implements InboundTriage {
  constructor(private readonly dependencies: SupportTriageDependencies) {}

  async assess(candidate: TriageCandidate): Promise<TriageDecision> {
    const { blocked, withinRateLimit, scoreSpam } = this.dependencies;

    if (isBlockedSender(await blocked.patterns(), candidate.senderEmail)) return quarantineFor("blocked_sender");
    if (!(await withinRateLimit(candidate.senderEmail))) return quarantineFor("flood");
    return decisionForSpamScore(await scoreSpam(candidate));
  }
}
