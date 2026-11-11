import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recommendedChain } from "~/ai/ranking";
import { MODEL_ROLES } from "~/ai/roles";
import { AiRepo } from "~/models/ai.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AI_INTENT_HANDLERS, AI_INTENTS, readAiIntent, type IntentFields } from "./intents.server";

setupTestDatabase();

const AT = 1_700_000_000_000;
const NO_FIELDS: IntentFields = { role: "", modelId: "", scope: "" };

/** Runs one intent against the real repository, then reads every chain back. */
async function run(intent: (typeof AI_INTENTS)[number], fields: Partial<IntentFields>, seed?: (repo: AiRepo) => Promise<void>) {
  return runWithRequestContext(env, async () => {
    const repo = new AiRepo();
    await seed?.(repo);
    const outcome = await AI_INTENT_HANDLERS[intent]({ ...NO_FIELDS, ...fields }, { repo, actor: "owner@workmanjsc.vn", at: AT });
    const chains = Object.fromEntries(await Promise.all(MODEL_ROLES.map(async (role) => [role, await repo.chainFor(role, AT)])));
    return { outcome, chains };
  });
}

const TUNED = "@cf/tuned/by-hand";
const tune = (repo: AiRepo) => repo.addToChain({ role: "writing", modelId: TUNED, updatedBy: null, at: AT });

describe("the one-click preset", () => {
  it("sets every purpose to its recommended chain when none is configured", async () => {
    const { outcome, chains } = await run("preset", { scope: "empty" });

    expect(outcome).toEqual({ success: "Recommended models set for 5 purposes." });
    for (const role of MODEL_ROLES) expect(chains[role]).toEqual(recommendedChain(role));
  });

  it("fills only the empty purposes, leaving a hand-tuned chain exactly as it was", async () => {
    const { outcome, chains } = await run("preset", { scope: "empty" }, tune);

    expect(chains.writing).toEqual([TUNED]);
    expect(chains.summary).toEqual(recommendedChain("summary"));
    expect(outcome).toEqual({ success: "Recommended models set for 4 purposes." });
  });

  it("changes nothing, and says so, when every purpose already has models", async () => {
    const all = await run("preset", { scope: "all" });
    const again = await run("preset", { scope: "empty" }, async (repo) => {
      await repo.replaceChains(
        MODEL_ROLES.map((role) => ({ role, modelIds: [TUNED] })),
        { updatedBy: null, at: AT },
      );
    });

    expect(all.outcome).toEqual({ success: "Recommended models set for 5 purposes." });
    expect(again.outcome).toEqual({ success: "Every purpose already has models." });
    for (const role of MODEL_ROLES) expect(again.chains[role]).toEqual([TUNED]);
  });

  it("resets a tuned chain to the recommendation when asked for all", async () => {
    const { chains } = await run("preset", { scope: "all" }, tune);

    expect(chains.writing).toEqual(recommendedChain("writing"));
  });

  it.each(["", "everything", "ALL"])("refuses the scope %j and writes nothing", async (scope) => {
    const { outcome, chains } = await run("preset", { scope });

    expect(outcome).toEqual({ error: "That is not a preset we offer." });
    for (const role of MODEL_ROLES) expect(chains[role]).toEqual([]);
  });
});

describe("recommending for one purpose", () => {
  it("sets that purpose to its recommended chain and touches no other", async () => {
    const { outcome, chains } = await run("recommend", { role: "summary" });

    expect(outcome).toEqual({ success: "Summarising set to the recommended chain." });
    expect(chains.summary).toEqual(recommendedChain("summary"));
    expect(chains.writing).toEqual([]);
  });
});

describe("intents that name a purpose", () => {
  it.each(AI_INTENTS.filter((intent) => intent !== "preset"))("%s refuses a purpose we do not use", async (intent) => {
    const { outcome, chains } = await run(intent, { role: "not-a-purpose", modelId: TUNED });

    expect(outcome).toEqual({ error: "That is not a purpose we use." });
    for (const role of MODEL_ROLES) expect(chains[role]).toEqual([]);
  });

  it("refuses to add a model that is not in the catalogue", async () => {
    const { outcome, chains } = await run("add", { role: "writing", modelId: "@cf/typo/model" });

    expect(outcome).toEqual({ error: "That model is not in the catalogue." });
    expect(chains.writing).toEqual([]);
  });
});

describe("reading the submitted intent", () => {
  it.each(AI_INTENTS)("accepts %s", (intent) => {
    expect(readAiIntent(intent)).toBe(intent);
  });

  it.each(["", "delete", "Preset"])("refuses %j", (value) => {
    expect(readAiIntent(value)).toBeNull();
  });
});
