import { describe, expect, it } from "vitest";
import { AiService } from "./ai.server";
import { scoreSpam } from "./support-spam-check.server";
import { fakeDecider, fakeTextGenerator } from "~/test/fake-ai";
import { testIds } from "~/test/fake-runtime";
import type { AiFailureReason } from "~/ports/ai";
import type { TriageCandidate } from "~/support/triage/types";

const candidate: TriageCandidate = { source: "email", senderEmail: "seo@spam.example", subject: "Rank #1", body: "Buy links" };

/** The real `AiService` over an in-memory chain, so the gate, fallback and ledger behave as in production. */
function check(options: { probability?: number; fail?: AiFailureReason; chain?: string[]; gate?: AiFailureReason | null }) {
  const runs: { role: string; feature: string; shop: string | null; status: string }[] = [];
  const logged: unknown[] = [];
  const decider = fakeDecider({ ...(options.probability === undefined ? {} : { probability: options.probability }), ...(options.fail ? { fail: options.fail } : {}) });
  const ai = new AiService({
    repo: {
      chainFor: async () => options.chain ?? ["@cf/cloudflare/clef"],
      markHealth: async () => {},
      recordRun: async (run) => void runs.push(run),
    },
    generator: fakeTextGenerator(),
    decider,
    clock: { now: () => 1_700_000_000_000 },
    ids: testIds,
    gate: { refuse: async () => options.gate ?? null },
  });
  return { runs, logged, decider, score: () => scoreSpam({ ai, log: (entry) => logged.push(entry) }, candidate) };
}

describe("scoring a mail", () => {
  it.each([0, 0.02, 0.97, 1])("returns the model's probability %s", async (probability) => {
    expect(await check({ probability }).score()).toBe(probability);
  });

  it("asks the decision model about the mail, never showing the sender's address", async () => {
    const { decider, score } = check({ probability: 0.5 });
    await score();

    const [call] = decider.calls;
    expect(call?.state).toBe("Arrived via: plain email\nSubject: Rank #1\n\nBuy links");
    expect(call?.state).not.toContain("seo@spam.example");
  });

  it("is our own work on the decision purpose, charged to no shop", async () => {
    const { runs, score } = check({ probability: 0.1 });
    await score();
    expect(runs).toEqual([expect.objectContaining({ role: "decision", feature: "support.spam_triage", shop: null, status: "ok" })]);
  });

  it("has no score when no model is configured, and says why", async () => {
    const { score, logged } = check({ chain: [] });
    expect(await score()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "no_model" }]);
  });

  it("has no score when the provider fails", async () => {
    const { score, logged } = check({ fail: "provider" });
    expect(await score()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "provider" }]);
  });

  it("has no score when a gate refuses, such as the daily cap", async () => {
    const { score, logged } = check({ probability: 0.99, gate: "rate_limited" });
    expect(await score()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "rate_limited" }]);
  });

  it("has no score when the model answers with an impossible probability, rather than passing it on", async () => {
    expect(await check({ probability: 3 }).score()).toBeNull();
  });
});
