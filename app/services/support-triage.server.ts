import type { BlockedSenders, InboundTriage } from "~/ports/support-triage";
import { decisionForVerdict, quarantineFor } from "~/support/triage/decision";
import { isBlockedSender } from "~/support/triage/sender-pattern";
import type { SpamVerdict, TriageCandidate, TriageDecision } from "~/support/triage/types";

export interface SupportTriageDependencies {
  readonly blocked: BlockedSenders;
  /** True while the sender is within their allowance. Absent limiter: always true (fails open). */
  readonly withinRateLimit: (senderEmail: string) => Promise<boolean>;
  /** The model's verdict, or null when there is none. */
  readonly classify: (candidate: TriageCandidate) => Promise<SpamVerdict | null>;
}

/**
 * What happens to the first mail of a stranger. Cheapest refusal first, like the public form: the blocklist is one
 * small read, the limiter one binding call, and the model, which costs money, only ever sees mail that passed both.
 */
export class SupportTriageService implements InboundTriage {
  constructor(private readonly dependencies: SupportTriageDependencies) {}

  async assess(candidate: TriageCandidate): Promise<TriageDecision> {
    const { blocked, withinRateLimit, classify } = this.dependencies;

    if (isBlockedSender(await blocked.patterns(), candidate.senderEmail)) return quarantineFor("blocked_sender");
    if (!(await withinRateLimit(candidate.senderEmail))) return quarantineFor("flood");
    return decisionForVerdict(await classify(candidate));
  }
}
