import { recommendedChain } from "./ranking";
import { MODEL_ROLES, type ModelRole } from "./roles";

/** One purpose's chain, exactly as it should be stored: best model first. */
export interface ChainPlan {
  readonly role: ModelRole;
  readonly modelIds: readonly string[];
}

/**
 * Which purposes a one-click preset touches.
 *
 * `empty` fills only the purposes that have no models, so it can never overwrite
 * a chain an owner tuned by hand. `all` resets every purpose, which is why the
 * console asks for confirmation before sending it.
 */
export const PRESET_SCOPES = ["empty", "all"] as const;
export type PresetScope = (typeof PRESET_SCOPES)[number];

/** Narrow an untrusted string — a form field — to a scope. */
export function readPresetScope(value: string): PresetScope | null {
  return PRESET_SCOPES.find((scope) => scope === value) ?? null;
}

export function recommendedPlan(role: ModelRole): ChainPlan {
  return { role, modelIds: recommendedChain(role) };
}

/**
 * The chains a preset should write, given which purposes already have models.
 *
 * PURE: the caller reads what is configured and writes the result, so the policy
 * ("never clobber, unless asked to") is testable without a database.
 */
export function planRecommended(scope: PresetScope, configured: readonly ModelRole[]): ChainPlan[] {
  return MODEL_ROLES.filter((role) => scope === "all" || !configured.includes(role)).map(recommendedPlan);
}
