import { entitlementOf } from "@firesio/app/plans";
import { describe, expect, it } from "vitest";
import { ENTITLEMENT_LABELS } from "~/i18n/labels";
import { identity } from "./identity";
import { MEMBERS } from "./members";
import { PLANS } from "./plans";

describe("the app's own declarations", () => {
  it("has a members configuration where the owner and the admin hold everything and a stranger never gets the plan", () => {
    expect(MEMBERS.presets.get("owner")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get("admin")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get(MEMBERS.autoJoinRole)).not.toContain("billing:manage");
    expect(MEMBERS.notForStrangers).toContain("billing:manage");
    expect(MEMBERS.autoJoinRole).not.toBe(MEMBERS.ownerRole);
  });

  it("starts the plan table with the free plan (the one a shop with no subscription is served)", () => {
    expect(Object.keys(PLANS)[0]).toBe("free");
    expect(PLANS.free.monthly.amount).toBe(0);
  });

  it("names every entitlement key of every plan on the plans page, and none a plan does not declare", () => {
    const declared = new Set(Object.values(PLANS).flatMap((plan) => Object.keys(plan.entitlements)));
    expect(new Set(Object.keys(ENTITLEMENT_LABELS))).toEqual(declared);
  });

  it("uses a slug the contract accepts as our own app name", () => {
    expect(identity.slug).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("the seat limit read from the plan", () => {
  it("is the plan's members.max: unlimited on the free plan", () => {
    expect(entitlementOf(PLANS, "free", "members.max")).toEqual({ kind: "unlimited" });
  });
});
