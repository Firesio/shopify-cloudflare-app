import { AiService, allowAll } from "@firesio/ai";
import { D1AiRepository } from "@firesio/ai/d1";
import { noTextClient, workersAiDecider } from "~/adapters/workers-ai";
import { drizzle } from "drizzle-orm/d1";
import type { Runtime } from "./runtime";
import { jsonLog } from "./runtime";

/**
 * AI (`@firesio/ai`): a task names a purpose, never a model; which models serve a purpose is a row in `ai_models` that
 * someone chose from the catalogue. With no row the purpose is empty and the feature degrades (the spam check answers
 * "no opinion" and the mail opens a conversation). Add a quota with `composeGates(allowAll, quotaGate(...))` when a
 * merchant-facing AI feature is paid for by tokens.
 */
export function createAi(env: Env, runtime: Runtime): AiService {
  return new AiService({
    repo: new D1AiRepository(drizzle(env.DB)),
    client: noTextClient,
    decider: workersAiDecider(env.AI, env.AI_GATEWAY_ID),
    gate: allowAll,
    now: runtime.now,
    uuid: runtime.uuid,
    log: (entry) => jsonLog(entry),
  });
}
