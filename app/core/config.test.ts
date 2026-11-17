import { entitlementOf, planMeters, shownFeatures } from "@firesio/app/plans";
import { describe, expect, it } from "vitest";
import { identity } from "./identity";
import { MEMBERS } from "./members";
import { planCatalogue } from "./plans";

/** The catalogue as the app declares it; the count is this test's own (core reads no service: `app/firesio.server.ts` passes the real one). */
const OPEN_TICKETS = 7;
const PLANS = planCatalogue({ openTickets: () => Promise.resolve(OPEN_TICKETS) });

describe("the app's own declarations", () => {
  it("has a members configuration where the owner and the admin hold everything and a stranger never gets the plan", () => {
    expect(MEMBERS.presets.get("owner")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get("admin")).toEqual(MEMBERS.permissions);
    expect(MEMBERS.presets.get(MEMBERS.autoJoinRole)).not.toContain("billing:manage");
    expect(MEMBERS.notForStrangers).toContain("billing:manage");
    expect(MEMBERS.autoJoinRole).not.toBe(MEMBERS.ownerRole);
  });

  it("starts the plan table with the free plan (the one a shop with no subscription is served)", () => {
    expect(Object.keys(PLANS.plans)[0]).toBe("free");
    expect(PLANS.plans.free.monthly.amount).toBe(0);
  });

  it("names every feature the plans page shows, and every plan gives an entitlement for each feature and for no other", () => {
    for (const key of shownFeatures(PLANS)) expect(PLANS.features[key].name?.trim(), key).toBeTruthy();
    const declared = Object.keys(PLANS.features).sort();
    for (const plan of Object.values(PLANS.plans)) expect(Object.keys(plan.entitlements).sort()).toEqual(declared);
  });

  it("meters open tickets with the count it was given, and shows the seat limit as a ceiling", async () => {
    const meters = new Map(planMeters(PLANS).map((meter) => [meter.key, meter.source]));
    expect([...meters.keys()]).toEqual(["tickets.max", "members.max"]);
    const tickets = meters.get("tickets.max");
    expect(tickets?.kind).toBe("count");
    expect(tickets?.kind === "count" ? await tickets.count("a.myshopify.com", { now: 0, window: null }) : null).toBe(OPEN_TICKETS);
    expect(meters.get("members.max")).toEqual({ kind: "ceiling" });
  });

  it("uses a slug the contract accepts as our own app name", () => {
    expect(identity.slug).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("the seat limit read from the plan", () => {
  it("is the plan's members.max: unlimited on the free plan", () => {
    expect(entitlementOf(PLANS.plans, "free", "members.max")).toEqual({ kind: "unlimited" });
  });
});
