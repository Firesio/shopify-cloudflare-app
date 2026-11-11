import { describe, expect, it } from "vitest";
import type { SpamVerdict, TriageCandidate } from "~/support/triage/types";
import { SupportTriageService } from "./support-triage.server";

const candidate: TriageCandidate = { source: "email", senderEmail: "seo@spam.example", subject: "Rank #1", body: "Buy links" };

/** A classifier that must not be reached: asking it is what the cheaper refusals exist to avoid. */
const mustNotAsk = async (): Promise<SpamVerdict | null> => {
  throw new Error("the model was consulted");
};

function triage(over: {
  patterns?: readonly string[];
  withinRateLimit?: boolean;
  classify?: (candidate: TriageCandidate) => Promise<SpamVerdict | null>;
}) {
  return new SupportTriageService({
    blocked: { patterns: async () => over.patterns ?? [] },
    withinRateLimit: async () => over.withinRateLimit ?? true,
    classify: over.classify ?? (async () => "legit"),
  });
}

describe("assessing a stranger's mail", () => {
  it("holds a blocked sender without rate limiting or asking the model", async () => {
    const service = new SupportTriageService({
      blocked: { patterns: async () => ["spam.example"] },
      withinRateLimit: async () => {
        throw new Error("the limiter was consulted");
      },
      classify: mustNotAsk,
    });
    expect(await service.assess(candidate)).toEqual({ action: "quarantine", reason: "blocked_sender" });
  });

  it("holds a sender over their allowance, without asking the model", async () => {
    const decision = await triage({ withinRateLimit: false, classify: mustNotAsk }).assess(candidate);
    expect(decision).toEqual({ action: "quarantine", reason: "flood" });
  });

  it("holds a mail the model calls spam", async () => {
    expect(await triage({ classify: async () => "spam" }).assess(candidate)).toEqual({ action: "quarantine", reason: "ai_spam" });
  });

  it.each<SpamVerdict | null>(["legit", "unsure", null])("opens the conversation when the verdict is %s", async (verdict) => {
    expect(await triage({ classify: async () => verdict }).assess(candidate)).toEqual({ action: "open" });
  });

  it("shows the model what the mail said", async () => {
    const seen: TriageCandidate[] = [];
    await triage({ classify: async (mail) => (seen.push(mail), "legit") }).assess(candidate);
    expect(seen).toEqual([candidate]);
  });
});
