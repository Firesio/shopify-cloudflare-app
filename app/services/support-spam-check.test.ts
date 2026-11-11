import { describe, expect, it } from "vitest";
import { AiService } from "./ai.server";
import { classifySpam } from "./support-spam-check.server";
import { fakeTextGenerator } from "~/test/fake-ai";
import { testIds } from "~/test/fake-runtime";
import type { AiFailureReason } from "~/ports/ai";
import type { TriageCandidate } from "~/support/triage/types";

const candidate: TriageCandidate = { source: "email", senderEmail: "seo@spam.example", subject: "Rank #1", body: "Buy links" };

/** The real `AiService` over an in-memory chain, so the gate, fallback and ledger behave as in production. */
function check(options: { object?: unknown; fail?: AiFailureReason; chain?: string[]; gate?: AiFailureReason | null }) {
  const runs: { role: string; feature: string; shop: string | null; status: string }[] = [];
  const logged: unknown[] = [];
  const ai = new AiService({
    repo: {
      chainFor: async () => options.chain ?? ["@cf/fake/model"],
      markHealth: async () => {},
      recordRun: async (run) => void runs.push(run),
    },
    generator: fakeTextGenerator({ object: options.object, ...(options.fail ? { fail: options.fail } : {}) }),
    clock: { now: () => 1_700_000_000_000 },
    ids: testIds,
    gate: { refuse: async () => options.gate ?? null },
  });
  return { runs, logged, classify: () => classifySpam({ ai, log: (entry) => logged.push(entry) }, candidate) };
}

describe("classifying a mail", () => {
  it.each(["legit", "spam", "unsure"] as const)("returns the model's verdict %s", async (verdict) => {
    expect(await check({ object: { verdict } }).classify()).toBe(verdict);
  });

  it("is our own work on the classification purpose, charged to no shop", async () => {
    const { runs, classify } = check({ object: { verdict: "legit" } });
    await classify();
    expect(runs).toEqual([{ role: "classification", feature: "support.spam_triage", shop: null, status: "ok" }].map((run) => expect.objectContaining(run)));
  });

  it("has no verdict when no model is configured, and says why", async () => {
    const { classify, logged } = check({ chain: [] });
    expect(await classify()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "no_model" }]);
  });

  it("has no verdict when the provider fails", async () => {
    const { classify, logged } = check({ fail: "provider" });
    expect(await classify()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "provider" }]);
  });

  it("has no verdict when a gate refuses, such as the daily cap", async () => {
    const { classify, logged } = check({ object: { verdict: "spam" }, gate: "rate_limited" });
    expect(await classify()).toBeNull();
    expect(logged).toEqual([{ event: "support.spam_check_unavailable", reason: "rate_limited" }]);
  });

  it("has no verdict when the model answers in the wrong shape, rather than guessing one", async () => {
    expect(await check({ object: { verdict: "definitely" } }).classify()).toBeNull();
  });
});
