import { describe, expect, it } from "vitest";
import { AiError } from "~/ports/ai";
import { WorkersAiDecider, type RunModel } from "./workers-ai-decider.server";

const request = { model: "@cf/cloudflare/clef-flash", state: "Subject: Rank #1\n\nBuy links", question: "Is this spam?" };

/** What the binding returned for a real call (2026-11-11), so the adapter is tested against the provider's own shape. */
const answered = (noul: number) => ({
  model: "clef-flash",
  answers: { answer: { type: "noul", noul } },
  usage: { input_tokens: 256, output_tokens: 0 },
});

function decider(run: RunModel | undefined, timeoutMs?: number) {
  return new WorkersAiDecider({ ...(run ? { run } : {}), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}

describe("deciding", () => {
  it("returns the probability of yes with its token usage", async () => {
    const result = await decider(async () => answered(0.9547)).decide(request);

    expect(result).toEqual({ probability: 0.9547, usage: { model: "@cf/cloudflare/clef-flash", inputTokens: 256, outputTokens: 0 } });
  });

  it("sends the model's own name, the content, and one yes/no question", async () => {
    const seen: { model: string; input: Record<string, unknown> }[] = [];
    await decider(async (model, input) => {
      seen.push({ model, input });
      return answered(0.1);
    }).decide(request);

    expect(seen).toEqual([
      {
        model: "@cf/cloudflare/clef-flash",
        input: {
          model: "clef-flash",
          state: request.state,
          questions: { answer: { type: "noul", instructions: "Is this spam?" } },
        },
      },
    ]);
  });

  it("is not configured without a binding", async () => {
    await expect(decider(undefined).decide(request)).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("reports a provider error as a provider failure", async () => {
    const failing = decider(async () => {
      throw new Error("AiError: 5006");
    });
    await expect(failing.decide(request)).rejects.toMatchObject({ reason: "provider", message: "AiError: 5006" });
  });

  it.each([
    ["no answers", { model: "clef", usage: { input_tokens: 1, output_tokens: 0 } }],
    ["a different kind of answer", { answers: { answer: { type: "choice", choice: "spam" } }, usage: { input_tokens: 1, output_tokens: 0 } }],
    ["a probability that is not a number", { answers: { answer: { type: "noul", noul: "high" } }, usage: { input_tokens: 1, output_tokens: 0 } }],
    ["not an object at all", "spam"],
  ])("refuses %s rather than guessing", async (_name, raw) => {
    const error = await decider(async () => raw).decide(request).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ reason: "provider" });
  });

  it("gives up after the timeout instead of waiting for a model that does not answer", async () => {
    const hanging = decider(() => new Promise(() => {}), 20);
    await expect(hanging.decide(request)).rejects.toMatchObject({ reason: "timeout" });
  });
});
