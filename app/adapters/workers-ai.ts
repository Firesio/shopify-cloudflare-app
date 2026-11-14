import { AiError, type AiClient, type AiDecider } from "@firesio/ai";
import { z } from "zod";

/**
 * Workers AI for this app. The library ships these adapters in `@firesio/ai/workers-ai`, but that entry type-checks
 * `createWorkersAI({ binding })` against the Workers runtime's `Ai` class, which the library's structural `AiBinding` does not
 * satisfy, so an app with Workers types cannot compile it (reported in step 13's findings). Until the library fixes
 * it, the decision adapter is repeated here (the request and answer shapes are the library's, `decider.ts`) and the text
 * client reports "not configured": this template's only AI feature is the spam decision. DELETE this file and import from
 * `@firesio/ai/workers-ai` once it compiles in an app.
 */
const QUESTION_ID = "answer";
const TIMEOUT_MS = 4_000;

const answerSchema = z.object({
  answers: z.object({ [QUESTION_ID]: z.object({ type: z.literal("noul"), noul: z.number() }) }),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

export function workersAiDecider(binding: Ai | undefined, gatewayId: string): AiDecider {
  return {
    async decide(request) {
      if (binding === undefined) throw new AiError("not_configured", "The Workers AI binding is not available.");
      const input = { model: request.model.slice(request.model.lastIndexOf("/") + 1), state: request.state, questions: { [QUESTION_ID]: { type: "noul", instructions: request.question } } };
      const options = gatewayId === "" ? undefined : { gateway: { id: gatewayId } };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiError("timeout", "The model did not answer in time.")), TIMEOUT_MS);
      });
      try {
        const raw: unknown = await Promise.race([binding.run(request.model, input, options), expired]);
        const answer = answerSchema.safeParse(raw);
        if (!answer.success) throw new AiError("provider", "The model's answer was not a yes/no probability.");
        const { noul } = answer.data.answers[QUESTION_ID];
        return { probability: noul, usage: { model: request.model, inputTokens: answer.data.usage.input_tokens, outputTokens: answer.data.usage.output_tokens } };
      } catch (cause) {
        throw cause instanceof AiError ? cause : new AiError("provider", cause instanceof Error ? cause.message : String(cause));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const none = (): never => {
  throw new AiError("not_configured", "This app has no text generation client: add one with @firesio/ai/workers-ai when it compiles.");
};

/** Text generation is not used by the template: every call is "not configured", which the service reports as a failed attempt. */
export const noTextClient: AiClient = {
  generate: () => Promise.reject(none()),
  stream: () => Promise.reject(none()),
  generateObject: () => Promise.reject(none()),
};
