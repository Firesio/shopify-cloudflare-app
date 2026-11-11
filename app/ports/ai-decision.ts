import type { AiUsage } from "~/ports/ai";

/**
 * The port a use case depends on to get a DECISION: how likely a yes/no question is to be true of some content.
 *
 * A decision model is not a text generator with a short answer. It does not write; it scores. It takes the content
 * (the "state") and a question, and returns a probability, in one fast call with no output tokens to parse, so
 * there is no JSON to get wrong and nothing in the content can talk the model into a different answer format.
 * That is why it is its own port rather than a method on `TextGenerator`: the request and the answer have a
 * different shape, and so do the models (`app/ai/decision-catalogue.ts`).
 *
 * Narrow on purpose: one yes/no question per call, because that is what the one caller needs. The provider accepts
 * many questions and other kinds (choice, score); widen this when a caller needs them.
 */
export interface DecideRequest {
  /** A concrete model id, e.g. "@cf/cloudflare/clef". The caller has already resolved the purpose. */
  readonly model: string;
  /** The content to judge. DATA: the question, not this, says what to decide. */
  readonly state: string;
  /** A yes/no question about the state. */
  readonly question: string;
}

export interface Decided {
  /** The probability the answer is yes, from 0 to 1. */
  readonly probability: number;
  readonly usage: AiUsage;
}

export interface Decider {
  /** Throws `AiError` (`~/ports/ai`); the service turns it into a `Result` for the caller. */
  decide(request: DecideRequest): Promise<Decided>;
}
