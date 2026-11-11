import { findCatalogueModel } from "~/ai/catalogue";
import { planRecommended, readPresetScope, recommendedPlan } from "~/ai/preset";
import { ROLE_LABEL, isModelRole, type ModelRole } from "~/ai/roles";
import type { aiRepository } from "~/wiring.server";

/** What the page shows after an intent: a toast either way. */
export type IntentOutcome = { readonly success: string } | { readonly error: string };

export interface IntentContext {
  readonly repo: ReturnType<typeof aiRepository>;
  /** Who is changing the setting, for the audit column. */
  readonly actor: string;
  readonly at: number;
}

/** The fields an intent may read, as submitted. Untrusted: each handler narrows what it uses. */
export interface IntentFields {
  readonly role: string;
  readonly modelId: string;
  readonly scope: string;
}

type Handler = (fields: IntentFields, context: IntentContext) => Promise<IntentOutcome>;
type RoleHandler = (input: { readonly role: ModelRole; readonly modelId: string }, context: IntentContext) => Promise<IntentOutcome>;

export const AI_INTENTS = ["add", "recommend", "preset", "remove", "up", "down", "enable", "disable"] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

/** The submitted intent, narrowed by membership: it comes off a form, so it is attacker-controlled. */
export function readAiIntent(value: string): AiIntent | null {
  return AI_INTENTS.find((intent) => intent === value) ?? null;
}

/**
 * Narrows the purpose by MEMBERSHIP, never a cast: it arrives off a form, and a model outside the catalogue
 * resolves to nothing at call time, which reads as a broken feature rather than a bad setting.
 */
function forRole(handle: RoleHandler): Handler {
  return (fields, context) => {
    const { role, modelId } = fields;
    if (!isModelRole(role)) return Promise.resolve({ error: "That is not a purpose we use." });
    return handle({ role, modelId }, context);
  };
}

const setEnabled =
  (enabled: boolean): RoleHandler =>
  async ({ role, modelId }, { repo, at }) => {
    await repo.setEnabled({ role, modelId, enabled, at });
    return { success: `Updated ${ROLE_LABEL[role]}.` };
  };

const reorder =
  (direction: "up" | "down"): RoleHandler =>
  async ({ role, modelId }, { repo, at }) => {
    await repo.reorder({ role, modelId, direction, at });
    return { success: `Reordered ${ROLE_LABEL[role]}.` };
  };

/**
 * Command dispatch on the submitted intent (@rules/core.md): the action only looks a handler up. Keyed by the intent
 * union, so a new intent cannot ship without one.
 */
export const AI_INTENT_HANDLERS: Record<AiIntent, Handler> = {
  add: forRole(async ({ role, modelId }, { repo, actor, at }) => {
    if (!findCatalogueModel(modelId)) return { error: "That model is not in the catalogue." };
    await repo.addToChain({ role, modelId, updatedBy: actor, at });
    return { success: `Added to ${ROLE_LABEL[role]}.` };
  }),
  // Seeds this purpose with the top of its own ranking. An explicit button rather than a silent default, so
  // "no models" stays a real, choosable state and what the runtime will actually use is always what the page shows.
  recommend: forRole(async ({ role }, { repo, actor, at }) => {
    await repo.replaceChains([recommendedPlan(role)], { updatedBy: actor, at });
    return { success: `${ROLE_LABEL[role]} set to the recommended chain.` };
  }),
  // Every purpose in one click. `empty` never touches a chain that already has models; `all` resets them.
  preset: async ({ scope }, { repo, actor, at }) => {
    const chosen = readPresetScope(scope);
    if (chosen === null) return { error: "That is not a preset we offer." };

    const configured = (await repo.allModels()).map((row) => row.role);
    const plans = planRecommended(chosen, configured);
    if (plans.length === 0) return { success: "Every purpose already has models." };

    await repo.replaceChains(plans, { updatedBy: actor, at });
    return { success: `Recommended models set for ${plans.length} ${plans.length === 1 ? "purpose" : "purposes"}.` };
  },
  remove: forRole(async ({ role, modelId }, { repo }) => {
    await repo.removeFromChain(role, modelId);
    return { success: `Removed from ${ROLE_LABEL[role]}.` };
  }),
  up: forRole(reorder("up")),
  down: forRole(reorder("down")),
  enable: forRole(setEnabled(true)),
  disable: forRole(setEnabled(false)),
};
