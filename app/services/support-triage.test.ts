import { describe, expect, it } from "vitest";
import type { TriageCandidate } from "~/support/triage/types";
import { SupportTriageService } from "./support-triage.server";

const candidate: TriageCandidate = { source: "email", senderEmail: "seo@spam.example", subject: "Rank #1", body: "Buy links" };

/** A scorer that must not be reached: asking it is what the cheaper refusals exist to avoid. */
const mustNotAsk = async (): Promise<number | null> => {
  throw new Error("the model was consulted");
};

function triage(over: {
  patterns?: readonly string[];
  withinRateLimit?: boolean;
  scoreSpam?: (candidate: TriageCandidate) => Promise<number | null>;
}) {
  return new SupportTriageService({
    blocked: { patterns: async () => over.patterns ?? [] },
    withinRateLimit: async () => over.withinRateLimit ?? true,
    scoreSpam: over.scoreSpam ?? (async () => 0),
  });
}

describe("assessing a stranger's mail", () => {
  it("holds a blocked sender without rate limiting or asking the model", async () => {
    const service = new SupportTriageService({
      blocked: { patterns: async () => ["spam.example"] },
      withinRateLimit: async () => {
        throw new Error("the limiter was consulted");
      },
      scoreSpam: mustNotAsk,
    });
    expect(await service.assess(candidate)).toEqual({ action: "quarantine", reason: "blocked_sender" });
  });

  it("holds a sender over their allowance, without asking the model", async () => {
    const decision = await triage({ withinRateLimit: false, scoreSpam: mustNotAsk }).assess(candidate);
    expect(decision).toEqual({ action: "quarantine", reason: "flood" });
  });

  it("holds a mail the model is sure is spam", async () => {
    expect(await triage({ scoreSpam: async () => 0.99 }).assess(candidate)).toEqual({ action: "quarantine", reason: "ai_spam" });
  });

  it.each<number | null>([0.01, 0.6, null])("opens the conversation when the score is %s", async (score) => {
    expect(await triage({ scoreSpam: async () => score }).assess(candidate)).toEqual({ action: "open" });
  });

  it("shows the model what the mail said", async () => {
    const seen: TriageCandidate[] = [];
    await triage({ scoreSpam: async (mail) => (seen.push(mail), 0) }).assess(candidate);
    expect(seen).toEqual([candidate]);
  });
});
