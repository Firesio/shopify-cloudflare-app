import { describe, expect, it } from "vitest";
import { planRecommended, readPresetScope, recommendedPlan } from "./preset";
import { recommendedChain } from "./ranking";
import { MODEL_ROLES } from "./roles";

const roles = (plans: readonly { role: string }[]) => plans.map((plan) => plan.role);

describe("planning the recommended chains", () => {
  it("fills every purpose when none has models", () => {
    expect(roles(planRecommended("empty", []))).toEqual([...MODEL_ROLES]);
  });

  it("leaves a purpose that already has models alone when filling empty ones", () => {
    // The point of `empty`: an owner's hand-tuned chain is never overwritten.
    const plans = planRecommended("empty", ["writing", "summary"]);
    expect(roles(plans)).toEqual(["reasoning", "extraction", "classification", "decision"]);
  });

  it("plans nothing when every purpose is configured", () => {
    expect(planRecommended("empty", MODEL_ROLES)).toEqual([]);
  });

  it("resets every purpose for `all`, configured or not", () => {
    expect(roles(planRecommended("all", ["writing"]))).toEqual([...MODEL_ROLES]);
  });

  it.each(MODEL_ROLES)("plans the purpose's own recommendation for %s", (role) => {
    expect(recommendedPlan(role)).toEqual({ role, modelIds: recommendedChain(role) });
    expect(planRecommended("all", []).find((plan) => plan.role === role)).toEqual(recommendedPlan(role));
  });
});

describe("reading a preset scope", () => {
  it.each(["empty", "all"])("accepts %s", (value) => {
    expect(readPresetScope(value)).toBe(value);
  });

  it.each(["", "ALL", "everything"])("refuses %j", (value) => {
    expect(readPresetScope(value)).toBeNull();
  });
});
