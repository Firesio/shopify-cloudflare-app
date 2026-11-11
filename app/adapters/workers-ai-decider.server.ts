import { z } from "zod";
import { getEnv } from "~/request-context.server";
import { AiError } from "~/ports/ai";
import type { Decided, DecideRequest, Decider } from "~/ports/ai-decision";

/**
 * The Workers AI adapter for decision models (Clef), over the binding's own `run`.
 *
 * Not the AI SDK, which the text adapter uses: the SDK speaks chat and structured generation, and a decision model
 * takes a different request (`state` and typed `questions`) and answers in probabilities. Cloudflare documents it
 * through `env.AI.run` and the REST API only.
 *
 * The binding is INJECTED, so the whole adapter runs against a stub with no network and no tokens.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/** The id of the one question this adapter sends; the answer comes back under it. */
const QUESTION_ID = "answer";

/** `env.AI.run`, narrowed to what this adapter needs. */
export type RunModel = (model: string, input: Record<string, unknown>) => Promise<unknown>;

export interface WorkersAiDeciderOptions {
  /** Absent = no Workers AI binding, which is the normal local-dev state. */
  readonly run?: RunModel;
  readonly timeoutMs?: number;
}

/**
 * What a yes/no ("noul") question answers with. The provider's word about its own output is checked, not trusted:
 * anything else is a failed attempt, never a number.
 */
const decisionAnswer = z.object({
  answers: z.object({ [QUESTION_ID]: z.object({ type: z.literal("noul"), noul: z.number() }) }),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

/** The binding Workers AI gives this request, or `undefined` where there is none. */
export function workersAiRunner(): RunModel | undefined {
  const binding = getEnv().AI;
  if (!binding) return undefined;
  return (model, input) => binding.run(model, input);
}

/** "@cf/cloudflare/clef-flash" → "clef-flash": what the request body's `model` field takes. */
function selectorOf(modelId: string): string {
  return modelId.slice(modelId.lastIndexOf("/") + 1);
}

async function within<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError("timeout", `The model did not answer within ${timeoutMs} ms.`)), timeoutMs);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

export class WorkersAiDecider implements Decider {
  constructor(private readonly options: WorkersAiDeciderOptions) {}

  async decide(request: DecideRequest): Promise<Decided> {
    const { run } = this.options;
    if (!run) throw new AiError("not_configured", "The Workers AI binding is not available.");

    const input = {
      model: selectorOf(request.model),
      state: request.state,
      questions: { [QUESTION_ID]: { type: "noul", instructions: request.question } },
    };

    let raw: unknown;
    try {
      raw = await within(run(request.model, input), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    } catch (cause) {
      throw cause instanceof AiError ? cause : new AiError("provider", cause instanceof Error ? cause.message : String(cause));
    }

    const answer = decisionAnswer.safeParse(raw);
    if (!answer.success) throw new AiError("provider", "The model's answer was not a yes/no probability.");

    return {
      probability: answer.data.answers[QUESTION_ID].noul,
      usage: {
        model: request.model,
        inputTokens: answer.data.usage.input_tokens,
        outputTokens: answer.data.usage.output_tokens,
      },
    };
  }
}
