/**
 * Proof that a request came from a person, for a public form that costs us a
 * row and staff attention. A port so the form's use case is decided without
 * a network, and the provider can change in one adapter.
 */
export type BotCheckResult = "passed" | "failed" | "unavailable";

export interface BotCheck {
  /** `unavailable` is the check itself failing: the caller must not treat it as a pass. */
  verify(token: string | null, ip: string | null): Promise<BotCheckResult>;
}
